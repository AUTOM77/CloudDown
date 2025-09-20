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

            // First try to get files from API, if that fails, fall back to DOM
            let fids = await getAllFilesViaAPI();

            // If API method didn't work well, use the DOM method as fallback
            if (fids.length === 0) {
                console.log("[CloudDown] API method returned no files, trying DOM method...");
                await loadAllPages(); // Load all pages first

                // Try both data-select-id and data-row-key attributes
                const selectIdElements = document.querySelectorAll("[data-select-id]");
                if (selectIdElements.length > 0) {
                    fids = Array.from(selectIdElements)
                        .map(el => el.getAttribute("data-select-id"))
                        .filter(fid => fid && fid.trim());
                    console.log(`[CloudDown] Found ${fids.length} files from data-select-id attributes`);
                }

                // Fallback to data-row-key if no data-select-id found
                if (fids.length === 0) {
                    fids = Array.from(document.querySelectorAll("tr.ant-table-row[data-row-key]"))
                        .map(row => row.getAttribute("data-row-key"))
                        .filter(fid => fid && fid.trim());
                    console.log(`[CloudDown] Found ${fids.length} files from data-row-key attributes`);
                }
            }

            if (fids.length === 0) {
                showNotification("未找到可下载的文件");
                return;
            }

            updateButton("正在获取下载链接...", true);

            // Get download links for all files
            const downloadLinks = [];
            for (let i = 0; i < fids.length; i++) {
                try {
                    const response = await fetch(
                        "https://drive-pc.quark.cn/1/clouddrive/file/download?pr=ucpro&fr=pc&uc_param_str=",
                        {
                            method: "POST",
                            headers: {
                                "accept": "application/json, text/plain, */*",
                                "content-type": "application/json;charset=UTF-8",
                            },
                            body: JSON.stringify({ fids: [fids[i]] }),
                            credentials: "include",
                            signal: abortController ? abortController.signal : undefined
                        }
                    );

                    if (response.ok) {
                        const data = await response.json();
                        if (data.data && data.data[0]) {
                            downloadLinks.push({
                                url: data.data[0].download_url,
                                name: data.data[0].file_name
                            });
                        }
                    }
                } catch (error) {
                    console.error(`[CloudDown] 获取文件 ${i + 1} 链接失败:`, error);
                }
            }

            resetButton(button, buttonContent);

            // Show download links and options
            const linksList = downloadLinks.map(link => `${link.name}: ${link.url}`).join('\n');
            console.log("[CloudDown] 下载链接列表:\n", linksList);

            // Create a better dialog with options
            const message = `找到 ${downloadLinks.length} 个文件的下载链接\n\n` +
                          `选择操作:\n` +
                          `• 确定 - 开始批量下载\n` +
                          `• 取消 - 复制链接到控制台（可手动复制）`;

            const confirmed = window.confirm(message);

            if (!confirmed) {
                // Copy links to clipboard if possible
                try {
                    await navigator.clipboard.writeText(linksList);
                    showNotification("下载链接已复制到剪贴板！");
                } catch (err) {
                    console.log("[CloudDown] 无法自动复制，请从控制台手动复制链接");
                }
                resetButton(button, buttonContent);
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

            // Start downloading with the collected links
            for (let i = 0; i < downloadLinks.length; i++) {
                if (abortController && abortController.signal.aborted) break;
                updateProgress(i + 1, downloadLinks.length);

                try {
                    const link = downloadLinks[i];
                    const a = document.createElement("a");
                    a.href = link.url;
                    a.download = link.name;
                    a.style.display = "none";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    console.log(`[CloudDown] Downloaded ${i + 1}/${downloadLinks.length}: ${link.name}`);

                    if (i < downloadLinks.length - 1) {
                        await sleep(2000); // 2 second delay between downloads
                    }
                } catch (error) {
                    if (error.name === "AbortError") {
                        console.log("[CloudDown] 下载已取消");
                        break;
                    }
                    console.error(`[CloudDown] 下载文件 ${i + 1} 失败:`, error);
                }
            }

            resetButton(button, buttonContent);
            if (!abortController || !abortController.signal.aborted) {
                showNotification("CloudDown 批量下载完成！");
            }
        } catch (error) {
            console.error("[CloudDown] 批量下载错误:", error);
            showNotification("批量下载失败，请查看控制台了解详情");
            resetButton(button, buttonContent);
        } finally {
            isDownloading = false;
            abortController = null;
        }
    }

    async function getAllFilesViaAPI() {
        const firstRow = document.querySelector("tr.ant-table-row[data-row-key]");
        let currentFolderId = null;

        if (firstRow) {
            const pathname = firstRow.getAttribute("pathname");
            const match = pathname?.match(/\/list\/all\/([a-z0-9]{32})/);
            if (match) currentFolderId = match[1];
        }

        if (!currentFolderId) {
            console.log("[CloudDown] Failed to get current folder ID");
            return [];
        }

        console.log(`[CloudDown] Current folder ID: ${currentFolderId}`);

        const url = `https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&pdir_fid=${currentFolderId}&_size=500`;

        try {
            const response = await fetch(url, {credentials: "include"});
            const data = await response.json();

            if (data.data?.list) {
                const fileIds = data.data.list
                    .filter(item => item.file && !item.dir)
                    .map(item => item.fid);

                console.log(`[CloudDown] Total files found via API: ${fileIds.length}`);
                return fileIds;
            }
        } catch (error) {
            console.error("[CloudDown] Error fetching files:", error);
        }

        return [];
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