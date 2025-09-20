(() => {
    "use strict";

    let isDownloading = false;
    let abortController = null;

    function injectButton() {
        const targetElement = document.querySelector(".SectionHeaderController--icon-download--1Z-OAHd");
        if (!targetElement || document.querySelector("#batch-download-btn")) return;

        const buttonWrapper = document.createElement("span");
        buttonWrapper.id = "batch-download-wrapper";
        buttonWrapper.className = "batch-download-wrapper";

        const button = document.createElement("button");
        button.id = "batch-download-btn";
        button.className = "batch-download-btn";
        button.setAttribute("type", "button");

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "16");
        svg.setAttribute("height", "16");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");

        const cloud = document.createElementNS("http://www.w3.org/2000/svg", "path");
        cloud.setAttribute("d", "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z");
        svg.appendChild(cloud);

        const arrow1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrow1.setAttribute("d", "M8 13v4m0 0l-2-2m2 2l2-2");
        svg.appendChild(arrow1);

        const arrow2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrow2.setAttribute("d", "M12 11v6m0 0l-2-2m2 2l2-2");
        svg.appendChild(arrow2);

        const arrow3 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrow3.setAttribute("d", "M16 13v4m0 0l-2-2m2 2l2-2");
        svg.appendChild(arrow3);

        const span = document.createElement("span");
        span.textContent = "BATCH_DL";

        button.appendChild(svg);
        button.appendChild(span);
        buttonWrapper.appendChild(button);
        targetElement.parentNode.insertBefore(buttonWrapper, targetElement);
        button.addEventListener("click", handleBatchDownload, { passive: true });
    }

    async function handleBatchDownload() {
        if (isDownloading) {
            showNotification("CloudDown 正在下载中，请稍候...");
            return;
        }

        const button = document.querySelector("#batch-download-btn");
        const buttonContent = button.cloneNode(true);

        try {
            isDownloading = true;
            abortController = new AbortController();

            updateButton("正在获取文件列表...", true);

            // Use API to get complete file list
            const fids = await getAllFilesViaAPI();

            if (fids.length === 0) {
                showNotification("未找到可下载的文件");
                return;
            }

            const confirmed = window.confirm(`确定要下载 ${fids.length} 个文件吗？`);
            if (!confirmed) {
                resetButton(buttonContent);
                isDownloading = false;
                return;
            }

            const updateProgress = (current, total) => {
                button.textContent = "";
                const svg = createSpinnerSVG();
                const span = document.createElement("span");
                span.textContent = `DL ${current}/${total}`;
                button.appendChild(svg);
                button.appendChild(span);
            };

            // Sequential download like v3.0.0 - more reliable for Quark Drive
            for (let i = 0; i < fids.length; i++) {
                if (abortController && abortController.signal.aborted) break;

                updateProgress(i + 1, fids.length);

                try {
                    await downloadFile(fids[i]);
                    if (i < fids.length - 1) {
                        await sleep(1000); // 1 second delay between downloads
                    }
                } catch (error) {
                    if (error.name === "AbortError") {
                        console.log("[CloudDown] 下载已取消");
                        break;
                    }
                    console.error(`[CloudDown] 下载文件 ${i + 1} 失败:`, error);
                }
            }

            resetButton(buttonContent);
            if (!abortController || !abortController.signal.aborted) {
                showNotification("CloudDown 批量下载完成！");
            }
        } catch (error) {
            console.error("[CloudDown] 批量下载错误:", error);
            showNotification("批量下载失败，请查看控制台了解详情");
            resetButton(buttonContent);
        } finally {
            isDownloading = false;
            abortController = null;
        }
    }

    async function getAllFilesViaAPI() {
        // First, try to get the current folder ID from DOM
        let folderIdFromDOM = getCurrentFolderIdFromDOM();
        console.log(`[CloudDown] Initial folder ID from DOM: ${folderIdFromDOM}`);

        let finalFolderId = folderIdFromDOM;

        // If DOM returned null or we need to verify, get folder ID from first file
        if (folderIdFromDOM === null || (folderIdFromDOM !== '0' && document.querySelector("tr.ant-table-row[data-row-key]"))) {
            console.log("[CloudDown] Getting actual folder ID from first file...");

            const firstFid = document.querySelector("tr.ant-table-row[data-row-key]")?.getAttribute("data-row-key");
            if (firstFid) {
                try {
                    // Use the correct API endpoint for file info
                    const response = await fetch(
                        `https://drive-pc.quark.cn/1/clouddrive/file/info?pr=ucpro&fr=pc&uc_param_str=`,
                        {
                            method: "POST",
                            headers: {
                                "accept": "application/json, text/plain, */*",
                                "content-type": "application/json;charset=UTF-8",
                                "sec-fetch-dest": "empty",
                                "sec-fetch-mode": "cors",
                                "sec-fetch-site": "same-site"
                            },
                            referrer: "https://pan.quark.cn/",
                            body: JSON.stringify({
                                fids: [firstFid]
                            }),
                            mode: "cors",
                            credentials: "include"
                        }
                    );

                    if (response.ok) {
                        const data = await response.json();
                        console.log("[CloudDown] File info response:", data);

                        if (data.data && data.data.length > 0 && data.data[0].pdir_fid) {
                            finalFolderId = data.data[0].pdir_fid;
                            console.log(`[CloudDown] ✓ Got current folder ID from first file's parent: ${finalFolderId}`);
                        } else if (data.data && data.data.length > 0) {
                            // If no pdir_fid, we might be in root
                            console.log("[CloudDown] File has no pdir_fid, likely in root folder");
                            finalFolderId = '0';
                        }
                    } else {
                        console.error(`[CloudDown] File info API error: ${response.status}`);
                        // Fallback to root if API fails
                        finalFolderId = finalFolderId || '0';
                    }
                } catch (error) {
                    console.error("[CloudDown] Error getting folder ID from file:", error);
                    finalFolderId = finalFolderId || '0';
                }
            } else {
                console.log("[CloudDown] No files in table to get folder ID from");
                finalFolderId = finalFolderId || '0';
            }
        }

        const allFiles = [];
        let page = 1;
        const pageSize = 100; // Fetch more files per request
        let hasMore = true;

        while (hasMore) {
            try {
                const response = await fetch(
                    `https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&uc_param_str=&pdir_fid=${finalFolderId}&_page=${page}&_size=${pageSize}&_fetch_total=1&_fetch_sub_dirs=0&_sort=file_type:asc,updated_at:desc`,
                    {
                        headers: {
                            "accept": "application/json, text/plain, */*",
                            "accept-language": "en,en-US;q=0.9",
                            "cache-control": "no-cache",
                            "pragma": "no-cache",
                            "sec-fetch-dest": "empty",
                            "sec-fetch-mode": "cors",
                            "sec-fetch-site": "same-site"
                        },
                        referrer: "https://pan.quark.cn/",
                        method: "GET",
                        mode: "cors",
                        credentials: "include"
                    }
                );

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();

                if (data.data && data.data.list) {
                    // Filter for downloadable files (not folders)
                    const files = data.data.list.filter(item =>
                        item.file && !item.dir && item.fid
                    ).map(item => item.fid);

                    allFiles.push(...files);
                    console.log(`[CloudDown] Page ${page}: Found ${files.length} files, Total: ${allFiles.length}`);
                }

                // Check if there are more pages
                if (data.metadata && data.metadata._total) {
                    const total = data.metadata._total;
                    hasMore = (page * pageSize) < total;
                } else {
                    hasMore = false;
                }

                page++;

                // Small delay to avoid rate limiting
                if (hasMore) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

            } catch (error) {
                console.error(`[CloudDown] Error fetching page ${page}:`, error);
                hasMore = false;
            }
        }

        console.log(`[CloudDown] Total files found via API: ${allFiles.length}`);
        return allFiles;
    }

    function getCurrentFolderIdFromDOM() {
        console.log("[CloudDown] Extracting folder ID from DOM...");

        // The URL parameter ?id= is the PARENT folder ID when viewing a subfolder
        // We need to find the CURRENT folder ID instead
        const urlParams = new URLSearchParams(window.location.search);
        const parentFolderId = urlParams.get('id');
        if (parentFolderId) {
            console.log(`[CloudDown] Parent folder ID from URL: ${parentFolderId} (not using this)`);
        }

        // Method 2: Look for folder ID in DOM attributes
        // Quark might store folder ID in data attributes
        const elements = document.querySelectorAll('[data-fid], [data-folder-id], [data-pdir-fid]');
        for (const el of elements) {
            const fid = el.dataset.fid || el.dataset.folderId || el.dataset.pdirFid;
            if (fid && fid.length === 32) { // Folder IDs are typically 32 characters
                console.log(`[CloudDown] ✓ Folder ID from data attribute: ${fid}`);
                return fid;
            }
        }

        // Method 3: Check React props in DOM elements
        // React often stores props in special properties
        const mainContent = document.querySelector('.section-main, .ant-table-wrapper, [class*="FileList"]');
        if (mainContent) {
            // Look for React fiber or props
            const reactKeys = Object.keys(mainContent).filter(key =>
                key.startsWith('__react') || key.startsWith('_react')
            );

            for (const key of reactKeys) {
                try {
                    const props = mainContent[key]?.memoizedProps || mainContent[key]?.pendingProps;
                    if (props?.folderId || props?.pdirFid || props?.pdir_fid) {
                        const fid = props.folderId || props.pdirFid || props.pdir_fid;
                        console.log(`[CloudDown] ✓ Folder ID from React props: ${fid}`);
                        return fid;
                    }
                } catch (e) {
                    // Continue if can't access React internals
                }
            }
        }

        // Method 4: Extract from breadcrumb links
        const breadcrumb = document.querySelector('.ant-breadcrumb');
        if (breadcrumb) {
            // Get the current (last) breadcrumb item
            const currentItem = breadcrumb.querySelector('.ant-breadcrumb-link:last-child') ||
                               breadcrumb.querySelector('[aria-current="page"]');
            if (currentItem) {
                const href = currentItem.getAttribute('href') || currentItem.querySelector('a')?.getAttribute('href');
                if (href) {
                    const match = href.match(/[?&]id=([a-f0-9]{32})/);
                    if (match) {
                        console.log(`[CloudDown] ✓ Folder ID from breadcrumb: ${match[1]}`);
                        return match[1];
                    }
                }
            }
        }

        // Method 5: Check if we're in root folder
        // Root folder has no URL parameter, or the page shows "全部文件"
        if (!parentFolderId) {
            const pageTitle = document.querySelector('[class*="title"], [class*="header"]');
            if (pageTitle) {
                const titleText = pageTitle.textContent;
                if (titleText === '全部文件' || titleText === '我的文件') {
                    console.log("[CloudDown] In root folder (no URL param and root title)");
                    return '0';
                }
            }
            // No parent ID in URL usually means root
            console.log("[CloudDown] In root folder (no URL parameter)");
            return '0';
        }

        // If we can't find the current folder ID from DOM, we need to get it from files
        console.log("[CloudDown] Current folder ID not found in DOM, will get from file info");
        return null; // Return null to indicate we need to get it from file API
    }

    function updateButton(text, showSpinner = false) {
        const button = document.querySelector("#batch-download-btn");
        button.textContent = "";

        if (showSpinner) {
            const svg = createSpinnerSVG();
            button.appendChild(svg);
        }

        const span = document.createElement("span");
        span.textContent = text;
        button.appendChild(span);
    }

    function resetButton(button, buttonContent) {
        button.textContent = "";
        button.appendChild(buttonContent.children[0].cloneNode(true));
        button.appendChild(buttonContent.children[1].cloneNode(true));
    }

    async function downloadFile(fid) {
        const response = await fetch(
            "https://drive-pc.quark.cn/1/clouddrive/file/download?pr=ucpro&fr=pc&uc_param_str=",
            {
                headers: {
                    "accept": "application/json, text/plain, */*",
                    "accept-language": "en,en-US;q=0.9",
                    "cache-control": "no-cache",
                    "content-type": "application/json;charset=UTF-8",
                    "pragma": "no-cache",
                    "priority": "u=1, i",
                    "sec-ch-ua": '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": '"macOS"',
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-site"
                },
                referrer: "https://pan.quark.cn/",
                body: JSON.stringify({ fids: [fid] }),
                method: "POST",
                mode: "cors",
                credentials: "include",
                signal: abortController ? abortController.signal : undefined
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.data && data.data[0]) {
            const item = data.data[0];
            if (item.download_url && item.file_name) {
                const a = document.createElement("a");
                a.href = item.download_url;
                a.download = item.file_name;
                a.style.display = "none";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function createSpinnerSVG() {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "spin");
        svg.setAttribute("width", "16");
        svg.setAttribute("height", "16");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", "12");
        circle.setAttribute("cy", "12");
        circle.setAttribute("r", "10");
        circle.setAttribute("stroke-opacity", "0.25");
        svg.appendChild(circle);

        const arc = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arc.setAttribute("d", "M12 2a10 10 0 0 1 10 10");
        arc.setAttribute("stroke-opacity", "1");
        svg.appendChild(arc);

        return svg;
    }

    function resetButton(button, buttonContent) {
        button.textContent = "";
        button.appendChild(buttonContent.children[0].cloneNode(true));
        button.appendChild(buttonContent.children[1].cloneNode(true));
    }

    async function downloadFile(fid) {
        const response = await fetch(
            "https://drive-pc.quark.cn/1/clouddrive/file/download?pr=ucpro&fr=pc&uc_param_str=",
            {
                headers: {
                    "accept": "application/json, text/plain, */*",
                    "accept-language": "en,en-US;q=0.9",
                    "cache-control": "no-cache",
                    "content-type": "application/json;charset=UTF-8",
                    "pragma": "no-cache",
                    "priority": "u=1, i",
                    "sec-ch-ua": '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": '"macOS"',
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-site"
                },
                referrer: "https://pan.quark.cn/",
                body: JSON.stringify({ fids: [fid] }),
                method: "POST",
                mode: "cors",
                credentials: "include",
                signal: abortController.signal
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.data && data.data[0]) {
            const item = data.data[0];
            if (item.download_url && item.file_name) {
                const a = document.createElement("a");
                a.href = item.download_url;
                a.download = item.file_name;
                a.style.display = "none";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        }
    }

    async function loadAllPages() {
        let hasMore = true;
        let attempts = 0;
        const maxAttempts = 100;

        while (hasMore && attempts < maxAttempts) {
            attempts++;

            const loadMoreButton = document.querySelector('.ant-pagination-next:not(.ant-pagination-disabled)');
            const scrollContainer = document.querySelector('.section-main');

            if (!loadMoreButton && !scrollContainer) {
                hasMore = false;
                break;
            }

            if (loadMoreButton) {
                loadMoreButton.click();
                await sleep(1500);
            }
            else if (scrollContainer) {
                const previousCount = document.querySelectorAll("tr.ant-table-row[data-row-key]").length;
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
                await sleep(1500);

                const currentCount = document.querySelectorAll("tr.ant-table-row[data-row-key]").length;

                if (currentCount === previousCount) {
                    hasMore = false;
                }
            }
        }

        console.log(`[CloudDown] Loaded all pages (${attempts} attempts)`);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function showNotification(message) {
        console.log(`[CloudDown] ${message}`);
        alert(message);
    }

    function observePageChanges() {
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    injectButton();
                    break;
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        injectButton();
        observePageChanges();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();