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

            // Format links - just URLs, one per line
            const linksList = downloadLinks.map(link => link.url).join('\n');
            console.log("[CloudDown] 下载链接列表:\n", linksList);

            // Create a modal dialog
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 10000;
                padding: 20px;
                max-width: 600px;
                width: 90%;
            `;

            modal.innerHTML = `
                <h3 style="margin: 0 0 15px 0; color: #333;">CloudDown - 找到 ${downloadLinks.length} 个文件</h3>
                <div style="margin-bottom: 15px; color: #666;">
                    <p>请选择操作:</p>
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="clouddown-copy" style="
                        padding: 8px 20px;
                        background: #f0f0f0;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    ">复制链接</button>
                    <button id="clouddown-download" style="
                        padding: 8px 20px;
                        background: #4a9eff;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    ">批量下载</button>
                    <button id="clouddown-cancel" style="
                        padding: 8px 20px;
                        background: #fff;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    ">取消</button>
                </div>
                <div id="clouddown-status" style="margin-top: 10px; color: #4CAF50; display: none;"></div>
            `;

            // Create overlay
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 9999;
            `;

            document.body.appendChild(overlay);
            document.body.appendChild(modal);

            // Wait for user action
            const userAction = await new Promise((resolve) => {
                const copyBtn = modal.querySelector('#clouddown-copy');
                const downloadBtn = modal.querySelector('#clouddown-download');
                const cancelBtn = modal.querySelector('#clouddown-cancel');
                const statusDiv = modal.querySelector('#clouddown-status');

                copyBtn.onclick = async () => {
                    try {
                        await navigator.clipboard.writeText(linksList);
                        statusDiv.textContent = '✓ 链接已复制到剪贴板！';
                        statusDiv.style.display = 'block';
                        setTimeout(() => {
                            document.body.removeChild(modal);
                            document.body.removeChild(overlay);
                            resolve('copy');
                        }, 1500);
                    } catch (err) {
                        statusDiv.textContent = '复制失败，请查看控制台手动复制';
                        statusDiv.style.color = '#f44336';
                        statusDiv.style.display = 'block';
                        console.log("[CloudDown] 链接列表:\n", linksList);
                    }
                };

                downloadBtn.onclick = () => {
                    document.body.removeChild(modal);
                    document.body.removeChild(overlay);
                    resolve('download');
                };

                cancelBtn.onclick = () => {
                    document.body.removeChild(modal);
                    document.body.removeChild(overlay);
                    resolve('cancel');
                };

                overlay.onclick = () => {
                    document.body.removeChild(modal);
                    document.body.removeChild(overlay);
                    resolve('cancel');
                };
            });

            if (userAction === 'copy') {
                isDownloading = false;
                return;
            } else if (userAction === 'cancel') {
                isDownloading = false;
                return;
            }

            const updateProgress = (current, total, failed = 0, retrying = false) => {
                button.textContent = "";
                const svg = createSpinnerSVG();
                const span = document.createElement("span");
                let statusText = `DL ${current}/${total}`;
                if (failed > 0) statusText += ` (失败:${failed})`;
                if (retrying) statusText += ` [重试中]`;
                span.textContent = statusText;
                button.appendChild(svg);
                button.appendChild(span);
            };

            // Download queue implementation with concurrency limit
            const MAX_CONCURRENT = 5;
            const failedDownloads = [];
            let completedCount = 0;
            let activeDownloads = 0;
            let downloadQueue = [...downloadLinks];

            const downloadFile = async (link, retryCount = 0) => {
                const maxRetries = 3;

                try {
                    const a = document.createElement("a");
                    a.href = link.url;
                    a.download = link.name;
                    a.style.display = "none";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    // Wait a bit to ensure download started
                    await sleep(500);

                    console.log(`[CloudDown] ✓ Downloaded: ${link.name}`);
                    return true;
                } catch (error) {
                    console.error(`[CloudDown] Failed to download ${link.name}:`, error);
                    if (retryCount < maxRetries - 1) {
                        console.log(`[CloudDown] Retrying ${link.name} (${retryCount + 1}/${maxRetries})...`);
                        await sleep(2000);
                        return downloadFile(link, retryCount + 1);
                    }
                    return false;
                }
            };

            const processQueue = async () => {
                const results = await Promise.all(
                    Array(MAX_CONCURRENT).fill(null).map(async () => {
                        while (downloadQueue.length > 0) {
                            if (abortController?.signal.aborted) break;

                            const link = downloadQueue.shift();
                            activeDownloads++;
                            updateProgress(completedCount + activeDownloads, downloadLinks.length, failedDownloads.length);

                            const success = await downloadFile(link);

                            if (!success) {
                                failedDownloads.push(link);
                            }

                            completedCount++;
                            activeDownloads--;
                            updateProgress(completedCount, downloadLinks.length, failedDownloads.length);

                            // Small delay between downloads to prevent server overload
                            if (downloadQueue.length > 0) {
                                await sleep(1000);
                            }
                        }
                    })
                );
            };

            console.log(`[CloudDown] Starting batch download of ${downloadLinks.length} files...`);
            console.log(`[CloudDown] Max concurrent downloads: ${MAX_CONCURRENT}`);

            // Process initial queue
            await processQueue();

            // Retry failed downloads
            if (failedDownloads.length > 0) {
                console.log(`[CloudDown] Retrying ${failedDownloads.length} failed downloads...`);
                updateProgress(completedCount, downloadLinks.length, failedDownloads.length, true);

                const retryList = [...failedDownloads];
                failedDownloads.length = 0;
                downloadQueue = retryList;

                await sleep(3000); // Wait before retrying
                await processQueue();
            }

            // Final verification
            const totalSuccess = downloadLinks.length - failedDownloads.length;
            console.log(`[CloudDown] Download complete!`);
            console.log(`[CloudDown] Success: ${totalSuccess}/${downloadLinks.length}`);

            if (failedDownloads.length > 0) {
                console.error(`[CloudDown] Failed downloads (${failedDownloads.length}):`,
                    failedDownloads.map(f => f.name));

                // Show failed files to user
                const failedNames = failedDownloads.map(f => f.name).join('\n');
                showNotification(`下载完成，但有 ${failedDownloads.length} 个文件失败:\n${failedNames}`);
            } else {
                showNotification(`CloudDown 成功下载全部 ${downloadLinks.length} 个文件！`);
            }

            resetButton(button, buttonContent);
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