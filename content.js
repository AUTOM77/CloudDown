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

            // Create a modal dialog with textarea for links
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
                max-width: 700px;
                width: 90%;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
            `;

            modal.innerHTML = `
                <h3 style="margin: 0 0 15px 0; color: #333;">CloudDown - 成功获取 ${downloadLinks.length} 个下载链接</h3>
                <div style="margin-bottom: 10px; color: #666; font-size: 14px;">
                    <p style="margin: 5px 0;">✓ 所有链接已获取成功</p>
                    <p style="margin: 5px 0;">• 点击"复制全部链接"复制到剪贴板</p>
                    <p style="margin: 5px 0;">• 可以使用 IDM、迅雷等下载工具批量下载</p>
                </div>
                <textarea id="clouddown-links" style="
                    width: 100%;
                    height: 300px;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 12px;
                    resize: vertical;
                    box-sizing: border-box;
                    background: #f9f9f9;
                " readonly>${linksList}</textarea>
                <div style="display: flex; gap: 10px; justify-content: space-between; margin-top: 15px;">
                    <div style="color: #666; font-size: 12px;">
                        共 ${downloadLinks.length} 个文件
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="clouddown-copy" style="
                            padding: 10px 24px;
                            background: #4a9eff;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                        ">复制全部链接</button>
                        <button id="clouddown-download" style="
                            padding: 10px 24px;
                            background: #52c41a;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                        ">浏览器下载</button>
                        <button id="clouddown-cancel" style="
                            padding: 10px 24px;
                            background: #fff;
                            border: 1px solid #ddd;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                        ">关闭</button>
                    </div>
                </div>
                <div id="clouddown-status" style="margin-top: 10px; color: #4CAF50; display: none; text-align: center;"></div>
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
                const linksTextarea = modal.querySelector('#clouddown-links');

                // Auto-select all text when clicking textarea
                linksTextarea.onclick = () => {
                    linksTextarea.select();
                };

                copyBtn.onclick = async () => {
                    try {
                        // Select all text in textarea
                        linksTextarea.select();

                        // Try modern clipboard API first
                        try {
                            await navigator.clipboard.writeText(linksList);
                            statusDiv.textContent = '✓ 已复制全部链接到剪贴板！';
                            statusDiv.style.display = 'block';
                            copyBtn.textContent = '✓ 已复制';
                            copyBtn.style.background = '#52c41a';
                        } catch (clipboardError) {
                            // Fallback to document.execCommand
                            document.execCommand('copy');
                            statusDiv.textContent = '✓ 已复制全部链接到剪贴板！';
                            statusDiv.style.display = 'block';
                            copyBtn.textContent = '✓ 已复制';
                            copyBtn.style.background = '#52c41a';
                        }

                        // Don't close modal after copy - user might want to copy again
                    } catch (err) {
                        statusDiv.textContent = '复制失败，请手动选择文本复制';
                        statusDiv.style.color = '#f44336';
                        statusDiv.style.display = 'block';
                        console.error("[CloudDown] 复制失败:", err);
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

            const updateProgress = (current, total, failed = 0, status = '') => {
                button.textContent = "";
                const svg = createSpinnerSVG();
                const span = document.createElement("span");
                let statusText = `DL ${current}/${total}`;
                if (failed > 0) statusText += ` (失败:${failed})`;
                if (status) statusText += ` ${status}`;
                span.textContent = statusText;
                button.appendChild(svg);
                button.appendChild(span);
            };

            // Sequential download - Quark doesn't support concurrent downloads
            const failedDownloads = [];
            let completedCount = 0;

            const downloadFile = async (link, retryCount = 0) => {
                const maxRetries = 3;

                try {
                    console.log(`[CloudDown] Checking file size for: ${link.name}`);

                    // First, get the file size with HEAD request
                    const headResponse = await fetch(link.url, {
                        method: 'HEAD',
                        mode: 'cors',
                        credentials: 'include',
                        signal: abortController?.signal
                    });

                    if (!headResponse.ok) {
                        throw new Error(`HEAD request failed: ${headResponse.status}`);
                    }

                    const contentLength = parseInt(headResponse.headers.get('content-length') || '0');
                    const acceptRanges = headResponse.headers.get('accept-ranges');

                    console.log(`[CloudDown] File: ${link.name}, Size: ${Math.round(contentLength / 1024 / 1024)}MB, Ranges: ${acceptRanges}`);

                    let blob;

                    // Try two-chunk download if Range is supported and file is larger than 1MB
                    if (acceptRanges === 'bytes' && contentLength > 1024 * 1024) {
                        const midPoint = Math.floor(contentLength / 2);

                        console.log(`[CloudDown] Downloading in 2 chunks: ${link.name}`);
                        updateProgress(
                            completedCount + 1,
                            downloadLinks.length,
                            failedDownloads.length,
                            '[0%]'
                        );

                        // Download two chunks concurrently
                        const chunkPromises = [
                            // First half
                            fetch(link.url, {
                                method: 'GET',
                                headers: {
                                    'Range': `bytes=0-${midPoint - 1}`
                                },
                                mode: 'cors',
                                credentials: 'include',
                                signal: abortController?.signal
                            }).then(async (response) => {
                                if (response.status !== 206) {
                                    throw new Error(`Chunk 1 failed: ${response.status} (expected 206)`);
                                }
                                const blob = await response.blob();
                                console.log(`[CloudDown] Chunk 1/2 complete: ${Math.round(blob.size / 1024)}KB`);
                                updateProgress(
                                    completedCount + 1,
                                    downloadLinks.length,
                                    failedDownloads.length,
                                    '[50%]'
                                );
                                return { index: 0, blob };
                            }),

                            // Second half
                            fetch(link.url, {
                                method: 'GET',
                                headers: {
                                    'Range': `bytes=${midPoint}-${contentLength - 1}`
                                },
                                mode: 'cors',
                                credentials: 'include',
                                signal: abortController?.signal
                            }).then(async (response) => {
                                if (response.status !== 206) {
                                    throw new Error(`Chunk 2 failed: ${response.status} (expected 206)`);
                                }
                                const blob = await response.blob();
                                console.log(`[CloudDown] Chunk 2/2 complete: ${Math.round(blob.size / 1024)}KB`);
                                return { index: 1, blob };
                            })
                        ];

                        // Wait for both chunks
                        const chunks = await Promise.all(chunkPromises);
                        chunks.sort((a, b) => a.index - b.index);

                        // Merge chunks
                        console.log(`[CloudDown] Merging chunks for: ${link.name}`);
                        blob = new Blob([chunks[0].blob, chunks[1].blob], { type: 'application/octet-stream' });

                        // Verify size
                        if (blob.size !== contentLength) {
                            throw new Error(`Size mismatch: expected ${contentLength}, got ${blob.size}`);
                        }

                        updateProgress(
                            completedCount + 1,
                            downloadLinks.length,
                            failedDownloads.length,
                            '[100%]'
                        );

                    } else {
                        // Fallback to regular download
                        console.log(`[CloudDown] Regular download (no chunking): ${link.name}`);

                        const response = await fetch(link.url, {
                            method: 'GET',
                            mode: 'cors',
                            credentials: 'include',
                            signal: abortController?.signal
                        });

                        if (!response.ok) {
                            throw new Error(`Download failed: ${response.status}`);
                        }

                        blob = await response.blob();
                    }

                    // Wait to ensure file is fully received
                    await sleep(500);

                    // Create blob URL and trigger download
                    const blobUrl = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = blobUrl;
                    a.download = link.name;
                    a.style.display = "none";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    // Wait for download to fully complete before cleanup
                    await sleep(2000);
                    window.URL.revokeObjectURL(blobUrl);

                    completedCount++;
                    console.log(`[CloudDown] ✓ Successfully downloaded (${completedCount}/${downloadLinks.length}): ${link.name}`);
                    return true;

                } catch (error) {
                    if (error.name === 'AbortError') {
                        console.log(`[CloudDown] Download aborted: ${link.name}`);
                        return false;
                    }

                    console.error(`[CloudDown] Failed to download ${link.name}:`, error.message);

                    if (retryCount < maxRetries - 1) {
                        console.log(`[CloudDown] Retrying ${link.name} (${retryCount + 1}/${maxRetries})...`);
                        await sleep(3000);
                        return downloadFile(link, retryCount + 1);
                    }
                    return false;
                }
            };

            console.log(`[CloudDown] Starting sequential download of ${downloadLinks.length} files...`);

            // Process downloads strictly one by one with fail-fast behavior
            let criticalFailure = false;

            for (let i = 0; i < downloadLinks.length; i++) {
                if (abortController?.signal.aborted) break;

                const link = downloadLinks[i];
                updateProgress(i + 1, downloadLinks.length, failedDownloads.length, '[下载中]');

                const success = await downloadFile(link);

                if (!success) {
                    failedDownloads.push(link);
                    console.error(`[CloudDown] CRITICAL: Failed after retries: ${link.name}`);
                    console.error(`[CloudDown] Aborting all remaining downloads due to failure`);
                    criticalFailure = true;

                    // Abort all remaining downloads
                    if (abortController) {
                        abortController.abort();
                    }
                    break; // Stop processing more files
                }

                // Wait between downloads to ensure connection is closed
                if (i < downloadLinks.length - 1) {
                    await sleep(1000);
                }
            }

            // Skip retry if critical failure occurred (fail-fast mode)
            if (!criticalFailure && failedDownloads.length > 0) {
                console.log(`[CloudDown] ===== Retrying ${failedDownloads.length} failed downloads =====`);

                const retryList = [...failedDownloads];
                failedDownloads.length = 0; // Clear failed list for retry

                for (let i = 0; i < retryList.length; i++) {
                    if (abortController?.signal.aborted) break;

                    const link = retryList[i];
                    updateProgress(completedCount + i + 1, downloadLinks.length, 0, '[重试中]');

                    console.log(`[CloudDown] Final retry for: ${link.name}`);
                    const success = await downloadFile(link, 0); // Reset retry count

                    if (!success) {
                        failedDownloads.push(link);
                        console.error(`[CloudDown] CRITICAL: Retry failed for ${link.name}`);
                        console.error(`[CloudDown] Aborting all operations due to failure`);
                        criticalFailure = true;

                        if (abortController) {
                            abortController.abort();
                        }
                        break;
                    }

                    // Wait between retry downloads
                    if (i < retryList.length - 1) {
                        await sleep(1000);
                    }
                }
            }

            // Final verification and report
            if (criticalFailure) {
                const totalProcessed = completedCount + failedDownloads.length;
                const remaining = downloadLinks.length - totalProcessed;

                console.log(`[CloudDown] ===== Download ABORTED =====`);
                console.log(`[CloudDown] Critical failure detected - fail-fast mode activated`);
                console.log(`[CloudDown] Completed: ${completedCount}/${downloadLinks.length}`);
                console.log(`[CloudDown] Failed: ${failedDownloads.length}`);
                console.log(`[CloudDown] Remaining (not attempted): ${remaining}`);

                if (failedDownloads.length > 0) {
                    console.error(`[CloudDown] Failed file:`, failedDownloads[0].name);
                }

                showNotification(
                    `下载失败！\n` +
                    `已完成: ${completedCount}/${downloadLinks.length}\n` +
                    `失败文件: ${failedDownloads[0]?.name || 'Unknown'}\n` +
                    `操作已中止`
                );
            } else {
                const totalSuccess = downloadLinks.length - failedDownloads.length;
                console.log(`[CloudDown] ===== Download Complete =====`);
                console.log(`[CloudDown] Success: ${totalSuccess}/${downloadLinks.length}`);

                if (failedDownloads.length > 0) {
                    console.error(`[CloudDown] Failed downloads (${failedDownloads.length}):`,
                        failedDownloads.map(f => f.name));

                    // Show failed files to user
                    const failedNames = failedDownloads.slice(0, 5).map(f => f.name).join('\n');
                    const moreText = failedDownloads.length > 5 ? `\n... 和其他 ${failedDownloads.length - 5} 个文件` : '';
                    showNotification(`下载完成，但有 ${failedDownloads.length} 个文件失败:\n${failedNames}${moreText}`);
                } else {
                    showNotification(`CloudDown 成功下载全部 ${downloadLinks.length} 个文件！`);
                }
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

    async function download_(url, filename, options = {}) {
        const {
            chunkSize = 5 * 1024 * 1024, // 5MB default chunk size
            maxConcurrent = 5, // Max concurrent chunk downloads
            retries = 3, // Retry attempts per chunk
            signal = null, // AbortSignal for cancellation
            onProgress = null // Progress callback: (downloaded, total) => {}
        } = options;

        try {
            // Step 1: Check if server supports range requests
            const headResponse = await fetch(url, {
                method: 'HEAD',
                mode: 'cors',
                credentials: 'include',
                signal
            });

            if (!headResponse.ok) {
                console.error(`[download_] HEAD request failed: ${headResponse.status}`);
                return { success: false, error: `HEAD request failed: ${headResponse.status}` };
            }

            const acceptRanges = headResponse.headers.get('accept-ranges');
            const contentLength = parseInt(headResponse.headers.get('content-length') || '0');
            const supportsRange = acceptRanges === 'bytes' && contentLength > 0;

            let blob;
            let totalDownloaded = 0;

            // Step 2: Download file (chunked or regular)
            if (supportsRange && contentLength > chunkSize) {
                console.log(`[download_] Chunked download: ${filename} (${Math.ceil(contentLength / 1024 / 1024)}MB)`);

                const chunks = [];
                const totalChunks = Math.ceil(contentLength / chunkSize);

                // Download chunks with concurrency control
                for (let i = 0; i < totalChunks; i += maxConcurrent) {
                    const batchSize = Math.min(maxConcurrent, totalChunks - i);
                    const chunkPromises = [];

                    for (let j = 0; j < batchSize; j++) {
                        const chunkIndex = i + j;
                        const start = chunkIndex * chunkSize;
                        const end = Math.min(start + chunkSize - 1, contentLength - 1);

                        const downloadChunk = async (attempt = 0) => {
                            try {
                                const response = await fetch(url, {
                                    method: 'GET',
                                    headers: {
                                        'Range': `bytes=${start}-${end}`
                                    },
                                    mode: 'cors',
                                    credentials: 'include',
                                    signal
                                });

                                // Verify Content-Range header
                                const contentRange = response.headers.get('content-range');
                                if (response.status !== 206 || !contentRange) {
                                    throw new Error(`Invalid range response: ${response.status}, Content-Range: ${contentRange}`);
                                }

                                // Parse and validate Content-Range
                                const rangeMatch = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/);
                                if (!rangeMatch) {
                                    throw new Error(`Invalid Content-Range format: ${contentRange}`);
                                }

                                const [, rangeStart, rangeEnd, rangeTotal] = rangeMatch;
                                if (parseInt(rangeStart) !== start || parseInt(rangeEnd) !== end) {
                                    throw new Error(`Content-Range mismatch: expected ${start}-${end}, got ${rangeStart}-${rangeEnd}`);
                                }

                                const chunkBlob = await response.blob();
                                const actualSize = chunkBlob.size;
                                const expectedSize = end - start + 1;

                                if (actualSize !== expectedSize) {
                                    throw new Error(`Chunk size mismatch: expected ${expectedSize}, got ${actualSize}`);
                                }

                                totalDownloaded += actualSize;
                                if (onProgress) {
                                    onProgress(totalDownloaded, contentLength);
                                }

                                console.log(`[download_] Chunk ${chunkIndex + 1}/${totalChunks} OK (${Math.round(actualSize / 1024)}KB)`);
                                return { index: chunkIndex, blob: chunkBlob };

                            } catch (error) {
                                if (attempt < retries - 1) {
                                    console.log(`[download_] Chunk ${chunkIndex} retry ${attempt + 1}/${retries}: ${error.message}`);
                                    await sleep(1000 * (attempt + 1)); // Exponential backoff
                                    return downloadChunk(attempt + 1);
                                }
                                throw error;
                            }
                        };

                        chunkPromises.push(downloadChunk());
                    }

                    // Wait for batch completion
                    try {
                        const batchResults = await Promise.all(chunkPromises);
                        batchResults.forEach(result => {
                            chunks[result.index] = result.blob;
                        });
                    } catch (error) {
                        console.error(`[download_] Batch failed: ${error.message}`);
                        return { success: false, error: error.message };
                    }
                }

                // Merge chunks
                console.log(`[download_] Merging ${chunks.length} chunks...`);
                blob = new Blob(chunks, { type: 'application/octet-stream' });

                // Verify final size
                if (blob.size !== contentLength) {
                    console.error(`[download_] Size mismatch: expected ${contentLength}, got ${blob.size}`);
                    return { success: false, error: `Size mismatch: expected ${contentLength}, got ${blob.size}` };
                }

            } else {
                // Regular download (no chunking)
                console.log(`[download_] Regular download: ${filename} (no chunking)`);

                for (let attempt = 0; attempt < retries; attempt++) {
                    try {
                        const response = await fetch(url, {
                            method: 'GET',
                            mode: 'cors',
                            credentials: 'include',
                            signal
                        });

                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}`);
                        }

                        // Stream with progress
                        if (response.body && contentLength > 0 && onProgress) {
                            const reader = response.body.getReader();
                            const chunks = [];

                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;

                                chunks.push(value);
                                totalDownloaded += value.length;
                                onProgress(totalDownloaded, contentLength);
                            }

                            blob = new Blob(chunks, { type: 'application/octet-stream' });
                        } else {
                            blob = await response.blob();
                        }

                        break; // Success, exit retry loop

                    } catch (error) {
                        if (attempt === retries - 1) {
                            console.error(`[download_] Download failed after ${retries} attempts: ${error.message}`);
                            return { success: false, error: error.message };
                        }
                        console.log(`[download_] Retry ${attempt + 1}/${retries}: ${error.message}`);
                        await sleep(1000 * (attempt + 1));
                    }
                }
            }

            // Step 3: Trigger browser download
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Cleanup after delay
            setTimeout(() => {
                window.URL.revokeObjectURL(blobUrl);
            }, 5000);

            console.log(`[download_] Success: ${filename} (${Math.round(blob.size / 1024 / 1024 * 100) / 100}MB)`);
            return { success: true, size: blob.size };

        } catch (error) {
            console.error(`[download_] Failed: ${filename} - ${error.message}`);
            return { success: false, error: error.message };
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