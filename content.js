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
            let fids = await getAllFilesViaAPI();
            if (fids.length === 0) {
                console.log("[CloudDown] API method returned no files, trying DOM method...");
                await loadAllPages(); // Load all pages first

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

            // Helper function to get file icon
            function getFileIcon(ext) {
                const icons = {
                    pdf: '📄', doc: '📝', docx: '📝', txt: '📋',
                    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️',
                    mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬',
                    mp3: '🎵', wav: '🎵', flac: '🎵',
                    zip: '📦', rar: '📦', '7z': '📦',
                    js: '💻', html: '💻', css: '💻',
                    xls: '📊', xlsx: '📊', csv: '📊',
                    ppt: '📽️', pptx: '📽️'
                };
                return icons[ext] || '📎';
            }

            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                z-index: 10000;
                padding: 0;
                max-width: 900px;
                width: 90%;
                max-height: 85vh;
                display: flex;
                flex-direction: column;
            `;

            modal.innerHTML = `
                <div style="padding: 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
                    <h2 style="margin: 0; color: white; font-size: 20px;">CloudDown 批量下载</h2>
                    <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">找到 ${downloadLinks.length} 个文件</p>
                </div>
                <div style="padding: 16px; border-bottom: 1px solid #f0f0f0;">
                    <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 12px;">
                        <input type="checkbox" id="select-all" checked style="width: 18px; height: 18px; margin-right: 8px;">
                        <span style="font-weight: 500;">全选/取消全选</span>
                    </label>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #666; font-size: 13px;">已选: <span id="selected-count" style="font-weight: bold; color: #1890ff;">${downloadLinks.length}</span> 个</span>
                        <button id="copy-selected" style="padding: 6px 16px; background: white; border: 1px solid #d9d9d9; border-radius: 6px; cursor: pointer; font-size: 13px;">复制选中链接</button>
                    </div>
                </div>
                <div style="flex: 1; overflow-y: auto; padding: 16px; max-height: 400px;">
                    <div id="file-list">
                        ${downloadLinks.map((link, index) => {
                            const ext = link.name.split('.').pop().toLowerCase();
                            const icon = getFileIcon(ext);
                            return `
                                <label style="display: flex; align-items: center; padding: 10px; margin-bottom: 8px; background: #fafafa; border-radius: 8px; cursor: pointer; transition: background 0.2s;"
                                    onmouseover="this.style.background='#f0f5ff'" onmouseout="this.style.background='#fafafa'">
                                    <input type="checkbox" class="file-checkbox" data-index="${index}" checked style="width: 16px; height: 16px; margin-right: 10px;">
                                    <span style="font-size: 18px; margin-right: 8px;">${icon}</span>
                                    <span style="flex: 1; font-size: 13px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${link.name}">${link.name}</span>
                                </label>
                            `;
                        }).join('')}
                    </div>
                </div>
                <div style="padding: 20px; border-top: 1px solid #e8e8e8; display: flex; justify-content: space-between;">
                    <div style="font-size: 13px; color: #666;">提示：建议使用专业下载工具</div>
                    <div style="display: flex; gap: 12px;">
                        <button id="clouddown-cancel" style="padding: 10px 24px; background: white; border: 1px solid #d9d9d9; border-radius: 6px; cursor: pointer;">取消</button>
                        <button id="clouddown-download" style="padding: 10px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">开始下载</button>
                    </div>
                </div>
                <div id="clouddown-status" style="display: none;"></div>
            `;

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

            const userAction = await new Promise((resolve) => {
                const downloadBtn = modal.querySelector('#clouddown-download');
                const cancelBtn = modal.querySelector('#clouddown-cancel');
                const selectAllBtn = modal.querySelector('#select-all');
                const copySelectedBtn = modal.querySelector('#copy-selected');
                const fileCheckboxes = modal.querySelectorAll('.file-checkbox');
                const selectedCount = modal.querySelector('#selected-count');

                // Update selected count
                const updateSelectedCount = () => {
                    const checked = modal.querySelectorAll('.file-checkbox:checked').length;
                    selectedCount.textContent = checked;
                    selectAllBtn.checked = checked === fileCheckboxes.length;
                };

                // Select all/none functionality
                selectAllBtn.onchange = () => {
                    fileCheckboxes.forEach(cb => cb.checked = selectAllBtn.checked);
                    updateSelectedCount();
                };

                // Individual checkbox change
                fileCheckboxes.forEach(cb => {
                    cb.onchange = updateSelectedCount;
                });

                // Copy selected links
                copySelectedBtn.onclick = async () => {
                    const selectedIndices = Array.from(modal.querySelectorAll('.file-checkbox:checked'))
                        .map(cb => parseInt(cb.dataset.index));
                    const selectedLinks = selectedIndices.map(i => downloadLinks[i].url).join('\n');

                    try {
                        await navigator.clipboard.writeText(selectedLinks);
                        const originalText = copySelectedBtn.textContent;
                        copySelectedBtn.textContent = '✓ 已复制';
                        copySelectedBtn.style.background = '#52c41a';
                        copySelectedBtn.style.color = 'white';
                        setTimeout(() => {
                            copySelectedBtn.textContent = originalText;
                            copySelectedBtn.style.background = 'white';
                            copySelectedBtn.style.color = 'initial';
                        }, 2000);
                    } catch (err) {
                        console.error("[CloudDown] 复制失败:", err);
                        alert('复制失败，请手动复制');
                    }
                };

                downloadBtn.onclick = () => {
                    const selectedIndices = Array.from(modal.querySelectorAll('.file-checkbox:checked'))
                        .map(cb => parseInt(cb.dataset.index));

                    if (selectedIndices.length === 0) {
                        alert('请至少选择一个文件');
                        return;
                    }

                    const selectedFiles = selectedIndices.map(i => downloadLinks[i]);
                    document.body.removeChild(modal);
                    document.body.removeChild(overlay);
                    resolve({ action: 'download', files: selectedFiles });
                };

                cancelBtn.onclick = () => {
                    document.body.removeChild(modal);
                    document.body.removeChild(overlay);
                    resolve({ action: 'cancel' });
                };

                overlay.onclick = () => {
                    document.body.removeChild(modal);
                    document.body.removeChild(overlay);
                    resolve({ action: 'cancel' });
                };
            });

            if (userAction.action === 'cancel') {
                isDownloading = false;
                return;
            }

            // Use selected files for download
            if (userAction.action === 'download') {
                const selectedFiles = userAction.files;
                const totalFiles = selectedFiles.length;  // Use this for all progress tracking
                console.log(`[CloudDown] User selected ${totalFiles} files for download`);

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

            const failedDownloads = [];
            let completedCount = 0;

            const downloadFile = async (link, retryCount = 0) => {
                const maxRetries = 3;

                try {
                    console.log(`[CloudDown] Downloading (${completedCount + 1}/${totalFiles}): ${link.name}`);

                    const response = await fetch(link.url, {
                        method: 'GET',
                        mode: 'cors',
                        credentials: 'include',
                        signal: abortController?.signal
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const blob = await response.blob();
                    console.log(`[CloudDown] Downloaded ${Math.round(blob.size / 1024 / 1024)}MB`);

                    await sleep(500);
                    const blobUrl = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = blobUrl;
                    a.download = link.name;
                    a.style.display = "none";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    await sleep(2000);
                    window.URL.revokeObjectURL(blobUrl);

                    completedCount++;
                    console.log(`[CloudDown] ✓ Successfully downloaded (${completedCount}/${totalFiles}): ${link.name}`);
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

            console.log(`[CloudDown] Starting sequential download of ${totalFiles} files...`);

            let criticalFailure = false;

            for (let i = 0; i < selectedFiles.length; i++) {
                if (abortController?.signal.aborted) break;

                const link = selectedFiles[i];
                updateProgress(i + 1, totalFiles, failedDownloads.length, '[下载中]');

                const success = await downloadFile(link);

                if (!success) {
                    failedDownloads.push(link);
                    console.error(`[CloudDown] CRITICAL: Failed after retries: ${link.name}`);
                    console.error(`[CloudDown] Aborting all remaining downloads due to failure`);
                    criticalFailure = true;

                    if (abortController) {
                        abortController.abort();
                    }
                    break;
                }

                if (i < selectedFiles.length - 1) {
                    await sleep(1000);
                }
            }

            if (!criticalFailure && failedDownloads.length > 0) {
                console.log(`[CloudDown] ===== Retrying ${failedDownloads.length} failed downloads =====`);

                const retryList = [...failedDownloads];
                failedDownloads.length = 0;

                for (let i = 0; i < retryList.length; i++) {
                    if (abortController?.signal.aborted) break;

                    const link = retryList[i];
                    updateProgress(completedCount + i + 1, totalFiles, 0, '[重试中]');

                    console.log(`[CloudDown] Final retry for: ${link.name}`);
                    const success = await downloadFile(link, 0);

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

                    if (i < retryList.length - 1) {
                        await sleep(1000);
                    }
                }
            }

            if (criticalFailure) {
                const totalProcessed = completedCount + failedDownloads.length;
                const remaining = totalFiles - totalProcessed;

                console.log(`[CloudDown] ===== Download ABORTED =====`);
                console.log(`[CloudDown] Critical failure detected - fail-fast mode activated`);
                console.log(`[CloudDown] Completed: ${completedCount}/${totalFiles}`);
                console.log(`[CloudDown] Failed: ${failedDownloads.length}`);
                console.log(`[CloudDown] Remaining (not attempted): ${remaining}`);

                if (failedDownloads.length > 0) {
                    console.error(`[CloudDown] Failed file:`, failedDownloads[0].name);
                }

                showNotification(
                    `下载失败！\n` +
                    `已完成: ${completedCount}/${totalFiles}\n` +
                    `失败文件: ${failedDownloads[0]?.name || 'Unknown'}\n` +
                    `操作已中止`
                );
            } else {
                const totalSuccess = totalFiles - failedDownloads.length;
                console.log(`[CloudDown] ===== Download Complete =====`);
                console.log(`[CloudDown] Success: ${totalSuccess}/${totalFiles}`);

                if (failedDownloads.length > 0) {
                    console.error(`[CloudDown] Failed downloads (${failedDownloads.length}):`,
                        failedDownloads.map(f => f.name));

                    const failedNames = failedDownloads.slice(0, 5).map(f => f.name).join('\n');
                    const moreText = failedDownloads.length > 5 ? `\n... 和其他 ${failedDownloads.length - 5} 个文件` : '';
                    showNotification(`下载完成，但有 ${failedDownloads.length} 个文件失败:\n${failedNames}${moreText}`);
                } else {
                    showNotification(`CloudDown 成功下载全部 ${totalFiles} 个文件！`);
                }
            }

            resetButton(button, buttonContent);
            }  // End of if (userAction.action === 'download')
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

            if (supportsRange && contentLength > chunkSize) {
                console.log(`[download_] Chunked download: ${filename} (${Math.ceil(contentLength / 1024 / 1024)}MB)`);

                const chunks = [];
                const totalChunks = Math.ceil(contentLength / chunkSize);

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

                                const contentRange = response.headers.get('content-range');
                                if (response.status !== 206 || !contentRange) {
                                    throw new Error(`Invalid range response: ${response.status}, Content-Range: ${contentRange}`);
                                }

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

                console.log(`[download_] Merging ${chunks.length} chunks...`);
                blob = new Blob(chunks, { type: 'application/octet-stream' });

                if (blob.size !== contentLength) {
                    console.error(`[download_] Size mismatch: expected ${contentLength}, got ${blob.size}`);
                    return { success: false, error: `Size mismatch: expected ${contentLength}, got ${blob.size}` };
                }

            } else {
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

                        break;

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

            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

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