(() => {
    "use strict";

    class QuarkDownloader {
        constructor(options = {}) {
            this.concurrency = options.concurrency || 3;
            this.retryAttempts = options.retryAttempts || 3;
            this.retryDelay = options.retryDelay || 1000;
            this.queue = [];
            this.activeDownloads = new Map();
            this.completed = [];
            this.failed = [];
            this.abortController = null;
            this.progress = {
                total: 0,
                completed: 0,
                failed: 0,
                inProgress: 0
            };
        }

        async downloadBatch(fids, updateCallback) {
            this.queue = [...fids];
            this.progress.total = fids.length;
            this.completed = [];
            this.failed = [];
            this.abortController = new AbortController();

            const downloadPromises = [];
            for (let i = 0; i < Math.min(this.concurrency, fids.length); i++) {
                downloadPromises.push(this.processQueue(updateCallback));
            }

            await Promise.all(downloadPromises);
            return {
                completed: this.completed,
                failed: this.failed,
                summary: this.progress
            };
        }

        async processQueue(updateCallback) {
            while (this.queue.length > 0 && !this.abortController.signal.aborted) {
                const fid = this.queue.shift();
                if (!fid) break;

                this.progress.inProgress++;
                if (updateCallback) {
                    updateCallback(this.progress);
                }

                const result = await this.downloadFileWithRetry(fid);

                this.progress.inProgress--;
                if (result.success) {
                    this.completed.push(fid);
                    this.progress.completed++;
                } else {
                    this.failed.push({ fid, error: result.error });
                    this.progress.failed++;
                }

                if (updateCallback) {
                    updateCallback(this.progress);
                }
            }
        }

        async downloadFileWithRetry(fid) {
            let attempts = 0;
            while (attempts < this.retryAttempts) {
                attempts++;
                try {
                    await this.downloadFile(fid);
                    return { success: true, fid };
                } catch (error) {
                    if (error.name === "AbortError") {
                        return { success: false, fid, error: "Aborted" };
                    }
                    console.error(`[CloudDown] Download attempt ${attempts}/${this.retryAttempts} failed for ${fid}:`, error);
                    if (attempts < this.retryAttempts) {
                        await this.sleep(this.retryDelay * attempts);
                    } else {
                        return { success: false, fid, error: error.message };
                    }
                }
            }
        }

        async downloadFile(fid) {
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
                    signal: this.abortController.signal
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
                    await this.sleep(300);
                }
            }
        }

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        abort() {
            if (this.abortController) {
                this.abortController.abort();
            }
        }
    }

    let isDownloading = false;
    let currentDownloader = null;

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
            const stopDownload = window.confirm("正在下载中，是否停止当前下载？");
            if (stopDownload && currentDownloader) {
                currentDownloader.abort();
                isDownloading = false;
                resetButton();
                showNotification("下载已停止");
            }
            return;
        }

        const button = document.querySelector("#batch-download-btn");
        const originalContent = button.innerHTML;

        try {
            isDownloading = true;

            updateButton("正在加载...", true);
            await loadAllPages();

            const fids = Array.from(document.querySelectorAll("tr.ant-table-row[data-row-key]"))
                .map(row => row.getAttribute("data-row-key"))
                .filter(fid => fid && fid.trim());

            if (fids.length === 0) {
                showNotification("未找到可下载的文件");
                return;
            }

            const options = await showDownloadOptions(fids.length);
            if (!options) {
                resetButton(originalContent);
                isDownloading = false;
                return;
            }

            currentDownloader = new QuarkDownloader({
                concurrency: options.concurrency,
                retryAttempts: options.retryAttempts,
                retryDelay: 1000
            });

            const updateProgress = (progress) => {
                const percentage = Math.round((progress.completed + progress.failed) / progress.total * 100);
                updateButton(`下载中 ${percentage}% (${progress.completed}/${progress.total})`, true);
            };

            const result = await currentDownloader.downloadBatch(fids, updateProgress);
            const message = `下载完成！\n✅ 成功: ${result.summary.completed}\n❌ 失败: ${result.summary.failed}`;
            showNotification(message);

        } catch (error) {
            console.error("[CloudDown] 批量下载错误:", error);
            showNotification("批量下载失败，请查看控制台了解详情");
        } finally {
            isDownloading = false;
            currentDownloader = null;
            resetButton(originalContent);
        }
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

    function resetButton(originalContent) {
        const button = document.querySelector("#batch-download-btn");
        if (originalContent) {
            button.innerHTML = originalContent;
        } else {
            updateButton("BATCH_DL");
        }
    }

    async function showDownloadOptions(fileCount) {
        const html = `
            <div style="padding: 10px;">
                <h3>批量下载设置</h3>
                <p>发现 ${fileCount} 个文件</p>
                <div style="margin: 15px 0;">
                    <label>并发下载数:
                        <input type="number" id="dl-concurrency" value="3" min="1" max="10" style="width: 50px; margin-left: 10px;">
                    </label>
                </div>
                <div style="margin: 15px 0;">
                    <label>重试次数:
                        <input type="number" id="dl-retry" value="3" min="1" max="5" style="width: 50px; margin-left: 10px;">
                    </label>
                </div>
                <p style="color: #666; font-size: 12px;">提示：并发数越高下载越快，但可能不稳定</p>
            </div>
        `;

        const container = document.createElement("div");
        container.innerHTML = html;
        container.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            z-index: 10000;
            min-width: 300px;
        `;

        const buttonContainer = document.createElement("div");
        buttonContainer.style.cssText = "text-align: center; margin-top: 20px;";

        const confirmBtn = document.createElement("button");
        confirmBtn.textContent = "开始下载";
        confirmBtn.style.cssText = "padding: 8px 20px; margin: 0 10px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;";

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "取消";
        cancelBtn.style.cssText = "padding: 8px 20px; margin: 0 10px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer;";

        buttonContainer.appendChild(confirmBtn);
        buttonContainer.appendChild(cancelBtn);
        container.appendChild(buttonContainer);

        document.body.appendChild(container);

        return new Promise((resolve) => {
            confirmBtn.onclick = () => {
                const concurrency = parseInt(document.getElementById("dl-concurrency").value);
                const retryAttempts = parseInt(document.getElementById("dl-retry").value);
                document.body.removeChild(container);
                resolve({ concurrency, retryAttempts });
            };

            cancelBtn.onclick = () => {
                document.body.removeChild(container);
                resolve(null);
            };
        });
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