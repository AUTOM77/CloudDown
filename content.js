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
        svg.setAttribute("viewBox", "0 0 16 16");
        svg.setAttribute("fill", "currentColor");

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M2 2h12v2H2V2zm0 3h12v2H2V5zm0 3h12v2H2V8zm2 3h8v1.5l-4 2.5-4-2.5V11z");
        svg.appendChild(path);

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

            const fids = Array.from(document.querySelectorAll("tr.ant-table-row[data-row-key]"))
                .map(row => row.getAttribute("data-row-key"))
                .filter(fid => fid && fid.trim());

            if (fids.length === 0) {
                showNotification("未找到可下载的文件");
                return;
            }

            const confirmed = window.confirm(`确定要下载 ${fids.length} 个文件吗？`);
            if (!confirmed) return;

            const updateProgress = (current, total) => {
                button.textContent = "";
                const svg = createSpinnerSVG();
                const span = document.createElement("span");
                span.textContent = `DL ${current}/${total}`;
                button.appendChild(svg);
                button.appendChild(span);
            };

            for (let i = 0; i < fids.length; i++) {
                if (abortController.signal.aborted) break;
                
                updateProgress(i + 1, fids.length);
                
                try {
                    await downloadFile(fids[i]);
                    if (i < fids.length - 1) {
                        await sleep(1000);
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
            if (!abortController.signal.aborted) {
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

    function createSpinnerSVG() {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "spin");
        svg.setAttribute("width", "16");
        svg.setAttribute("height", "16");
        svg.setAttribute("viewBox", "0 0 16 16");
        svg.setAttribute("fill", "currentColor");
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M8 1v2m0 10v2m7-7h-2M3 8H1m11.3-4.3l-1.4 1.4M5.1 10.9l-1.4 1.4m8.6 0l-1.4-1.4M5.1 5.1L3.7 3.7");
        svg.appendChild(path);
        
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