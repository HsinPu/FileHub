// File List Page JavaScript

let currentPath = '';
let allFiles = [];
let fileTreeData = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    loadFileTree();
    loadFileList();
    
    // 搜尋功能
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    
    searchInput.addEventListener('input', function() {
        filterFiles(this.value);
    });
    
    searchButton.addEventListener('click', function() {
        filterFiles(searchInput.value);
    });
    
    // 新增資料夾功能
    const createFolderBtn = document.getElementById('createFolderBtn');
    const createFolderModal = document.getElementById('createFolderModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const createFolderForm = document.getElementById('createFolderForm');
    
    createFolderBtn.addEventListener('click', function() {
        createFolderModal.classList.remove('hidden');
        document.getElementById('folderNameInput').focus();
    });
    
    closeModalBtn.addEventListener('click', closeCreateFolderModal);
    cancelBtn.addEventListener('click', closeCreateFolderModal);
    
    createFolderForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const folderName = document.getElementById('folderNameInput').value.trim();
        if (folderName) {
            createDirectory(folderName);
        }
    });
    
    // 點擊模態視窗外部關閉
    createFolderModal.addEventListener('click', function(e) {
        if (e.target === createFolderModal) {
            closeCreateFolderModal();
        }
    });
    
    // 檔案查看 Modal 功能
    const viewFileModal = document.getElementById('viewFileModal');
    const closeViewFileModalBtn = document.getElementById('closeViewFileModalBtn');
    
    closeViewFileModalBtn.addEventListener('click', closeViewFileModal);
    
    // 點擊模態視窗外部關閉
    viewFileModal.addEventListener('click', function(e) {
        if (e.target === viewFileModal) {
            closeViewFileModal();
        }
    });
});

// 關閉檔案查看 Modal
function closeViewFileModal() {
    const modal = document.getElementById('viewFileModal');
    modal.classList.add('hidden');
}

// 載入檔案列表
async function loadFileList(path = '') {
    try {
        const url = path ? `/api/v1/files?path=${encodeURIComponent(path)}` : '/api/v1/files';
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        currentPath = data.path;
        allFiles = data.files;
        
        renderFileList(allFiles);
        
    } catch (error) {
        console.error('載入檔案列表失敗:', error);
        showError('載入檔案列表失敗: ' + error.message);
    }
}

// 載入檔案樹狀圖
async function loadFileTree() {
    try {
        const response = await fetch('/api/v1/files/tree?max_depth=20');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        fileTreeData = data;
        
        // 除錯：檢查第三層資料
        if (data && data.children) {
            data.children.forEach((child, idx) => {
                if (child.name === '新增資料夾' && child.children && child.children.length > 0) {
                    console.log('找到「新增資料夾」，第三層子項目:', child.children.map(c => c.name));
                    console.log('第三層資料結構:', JSON.stringify(child.children, null, 2));
                }
            });
        }
        
        renderFileTree(data);
        
        // 除錯：檢查渲染後的 DOM 結構
        setTimeout(() => {
            const container = document.getElementById('fileTreeContainer');
            if (container) {
                const allTreeItems = container.querySelectorAll('.tree-item');
                console.log(`總共渲染了 ${allTreeItems.length} 個樹狀項目`);
                allTreeItems.forEach((item, idx) => {
                    const name = item.textContent.trim();
                    const level = item.closest('ul')?.querySelectorAll('ul').length || 0;
                    const hasChildren = item.querySelector('.tree-children');
                    const isHidden = hasChildren && hasChildren.classList.contains('hidden');
                    if (name.includes('新增資料夾') || name.includes('1234')) {
                        console.log(`項目 ${idx}: "${name}", 層級: ${level}, 有子節點: ${!!hasChildren}, 隱藏: ${isHidden}`);
                    }
                });
            }
        }, 100);
        
    } catch (error) {
        console.error('載入檔案樹狀圖失敗:', error);
        document.getElementById('fileTreeContainer').innerHTML = 
            '<div class="text-center py-8 text-red-500">載入失敗</div>';
    }
}

// 渲染檔案列表
function renderFileList(files) {
    const tbody = document.getElementById('fileTableBody');
    const emptyState = document.getElementById('emptyState');
    
    if (files.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    tbody.innerHTML = files.map(file => {
        const icon = getFileIcon(file.name, file.type);
        const typeText = file.type === 'directory' ? '資料夾' : getFileType(file.name);
        
        return `
            <tr class="transition-colors hover:bg-gray-50">
                <td class="px-4 py-4 border-b border-gray-200">
                    <div class="flex items-center">
                        <span class="w-6 h-6 inline-block mr-2">${icon}</span>
                        <span class="text-gray-500 ${file.type === 'directory' ? 'cursor-pointer hover:text-blue-500' : ''}" 
                              ${file.type === 'directory' ? `onclick="loadDirectory('${file.path}')"` : ''}>${escapeHtml(file.name)}</span>
                    </div>
                </td>
                <td class="px-4 py-4 border-b border-gray-200 text-gray-500">${typeText}</td>
                <td class="px-4 py-4 border-b border-gray-200 text-gray-500">${file.size_formatted}</td>
                <td class="px-4 py-4 border-b border-gray-200 text-gray-500">${file.modified_formatted}</td>
                <td class="px-4 py-4 border-b border-gray-200">
                    <button class="px-4 py-2 text-sm bg-transparent border-2 border-blue-500 text-blue-500 rounded-lg transition-all hover:bg-blue-500 hover:text-white"
                            onclick="viewFile('${file.path}', '${file.type}')">查看</button>
                </td>
            </tr>
        `;
    }).join('');
}

// 渲染檔案樹狀圖
function renderFileTree(treeData, container = null, level = 0) {
    if (!container) {
        container = document.getElementById('fileTreeContainer');
    }
    
    if (!treeData) {
        container.innerHTML = '<div class="text-center py-8 text-gray-400">沒有檔案</div>';
        return;
    }
    
    const ul = document.createElement('ul');
    ul.className = 'list-none p-0 m-0';
    if (level > 0) {
        ul.className += ' pl-6 mt-1';
    }
    
    // 根節點
    const li = document.createElement('li');
    li.className = `tree-item ${treeData.type} ${level === 0 ? 'expanded' : ''} py-1 select-none whitespace-nowrap ${treeData.type === 'directory' ? 'font-medium cursor-pointer' : 'cursor-default'}`;
    
    // 檢查是否有子節點
    const hasChildren = treeData.children && Array.isArray(treeData.children) && treeData.children.length > 0;
    const isExpanded = level === 0 || (hasChildren && level === 0);
    
    // 展開/收合按鈕（僅有子節點的目錄顯示）
    let expandButton = null;
    if (hasChildren && treeData.type === 'directory') {
        expandButton = document.createElement('span');
        expandButton.className = 'inline-block w-4 text-center cursor-pointer text-gray-600 hover:text-blue-500 mr-1 select-none';
        expandButton.textContent = isExpanded ? '−' : '+';
        expandButton.style.fontSize = '14px';
        expandButton.style.lineHeight = '1';
    }
    
    const icon = treeData.type === 'directory' ? '📁' : getFileIcon(treeData.name, treeData.type);
    const iconSpan = document.createElement('span');
    iconSpan.className = 'inline-block w-5 mr-2 text-center';
    iconSpan.textContent = icon;
    
    const labelSpan = document.createElement('span');
    labelSpan.className = `text-gray-800 transition-colors ${treeData.type === 'file' ? 'text-gray-500' : 'hover:text-blue-500'}`;
    labelSpan.textContent = treeData.name;
    
    // 只有目錄才能點擊載入
    if (treeData.type === 'directory') {
        labelSpan.style.cursor = 'pointer';
        // 點擊目錄名稱時，只載入目錄內容
        labelSpan.addEventListener('click', function(e) {
            e.stopPropagation();
            loadDirectory(treeData.path);
        });
    } else {
        // 檔案項目不應該有任何點擊行為，阻止所有事件
        labelSpan.style.cursor = 'default';
        labelSpan.style.pointerEvents = 'none';
        iconSpan.style.pointerEvents = 'none';
        // 阻止檔案項目的點擊事件冒泡
        li.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
        });
    }
    
    // 組裝 DOM 元素
    if (expandButton) {
        li.appendChild(expandButton);
    }
    li.appendChild(iconSpan);
    li.appendChild(labelSpan);
    
    // 子節點
    if (hasChildren) {
        const childrenUl = document.createElement('ul');
        childrenUl.className = `tree-children list-none pl-6 mt-1 ${level === 0 ? 'block' : 'hidden'}`;
        
        treeData.children.forEach(child => {
            // 確保所有子項目都能正確渲染，不論是否有自己的子節點
            if (child) {
                const childLi = renderTreeItem(child, level + 1);
                if (childLi) {
                    childrenUl.appendChild(childLi);
                } else {
                    console.warn(`Failed to render child at level ${level + 1}:`, child);
                }
            }
        });
        
        // 只有當有子節點時才加入
        if (childrenUl.children.length > 0) {
            li.appendChild(childrenUl);
            
            // 展開/收合按鈕的點擊事件
            if (expandButton && treeData.type === 'directory') {
                expandButton.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const isHidden = childrenUl.classList.contains('hidden');
                    if (isHidden) {
                        childrenUl.classList.remove('hidden');
                        childrenUl.classList.add('block');
                        li.classList.add('expanded');
                        expandButton.textContent = '−';
                    } else {
                        childrenUl.classList.add('hidden');
                        childrenUl.classList.remove('block');
                        li.classList.remove('expanded');
                        expandButton.textContent = '+';
                    }
                });
            }
        }
    }
    
    ul.appendChild(li);
    
    if (level === 0) {
        container.innerHTML = '';
        container.appendChild(ul);
    } else {
        return li;
    }
}

// 渲染樹狀圖項目
function renderTreeItem(item, level) {
    if (!item) {
        console.warn('renderTreeItem: item is null or undefined', level);
        return null;
    }
    
    const li = document.createElement('li');
    li.className = `tree-item ${item.type} py-1 select-none whitespace-nowrap ${item.type === 'directory' ? 'font-medium cursor-pointer' : 'cursor-default'}`;
    
    // 檢查是否有子節點
    const hasChildren = item.children && Array.isArray(item.children) && item.children.length > 0;
    
    // 展開/收合按鈕（僅有子節點的目錄顯示）
    let expandButton = null;
    if (hasChildren && item.type === 'directory') {
        expandButton = document.createElement('span');
        expandButton.className = 'inline-block w-4 text-center cursor-pointer text-gray-600 hover:text-blue-500 mr-1 select-none';
        expandButton.textContent = '+';
        expandButton.style.fontSize = '14px';
        expandButton.style.lineHeight = '1';
    }
    
    const icon = item.type === 'directory' ? '📁' : getFileIcon(item.name, item.type);
    const iconSpan = document.createElement('span');
    iconSpan.className = 'inline-block w-5 mr-2 text-center';
    iconSpan.textContent = icon;
    
    const labelSpan = document.createElement('span');
    labelSpan.className = `text-gray-800 transition-colors ${item.type === 'file' ? 'text-gray-500' : 'hover:text-blue-500'}`;
    labelSpan.textContent = item.name;
    
    // 只有目錄才能點擊載入
    if (item.type === 'directory') {
        labelSpan.style.cursor = 'pointer';
        // 點擊目錄名稱時，只載入目錄內容
        labelSpan.addEventListener('click', function(e) {
            e.stopPropagation();
            loadDirectory(item.path);
        });
    } else {
        // 檔案項目不應該有任何點擊行為，阻止所有事件
        labelSpan.style.cursor = 'default';
        labelSpan.style.pointerEvents = 'none';
        iconSpan.style.pointerEvents = 'none';
        // 阻止檔案項目的點擊事件冒泡
        li.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
        });
    }
    
    // 組裝 DOM 元素
    if (expandButton) {
        li.appendChild(expandButton);
    }
    li.appendChild(iconSpan);
    li.appendChild(labelSpan);
    
    // 子節點 - 檢查是否有 children 陣列且不為空
    if (hasChildren) {
        const childrenUl = document.createElement('ul');
        childrenUl.className = 'tree-children list-none pl-6 mt-1 hidden';
        
        // 遞迴處理所有子節點
        item.children.forEach((child, index) => {
            if (child) {
                // 確保所有子項目都能正確渲染，不論是否有自己的子節點
                const childLi = renderTreeItem(child, level + 1);
                if (childLi) {
                    childrenUl.appendChild(childLi);
                } else {
                    console.warn(`Failed to render child at level ${level + 1}:`, child);
                }
            }
        });
        
        // 只有當有子節點時才加入
        if (childrenUl.children.length > 0) {
            li.appendChild(childrenUl);
            
            // 展開/收合按鈕的點擊事件
            if (expandButton && item.type === 'directory') {
                expandButton.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const isHidden = childrenUl.classList.contains('hidden');
                    if (isHidden) {
                        childrenUl.classList.remove('hidden');
                        childrenUl.classList.add('block');
                        li.classList.add('expanded');
                        expandButton.textContent = '−';
                    } else {
                        childrenUl.classList.add('hidden');
                        childrenUl.classList.remove('block');
                        li.classList.remove('expanded');
                        expandButton.textContent = '+';
                    }
                });
            }
        }
    }
    
    return li;
}

// 載入目錄
function loadDirectory(path) {
    // 計算相對路徑
    const rootPath = fileTreeData ? fileTreeData.path : '/srv';
    const relativePath = path.replace(rootPath, '').replace(/^\//, '');
    loadFileList(relativePath);
}

// 查看檔案
async function viewFile(path, type) {
    if (type === 'directory') {
        loadDirectory(path);
        return;
    }
    
    // 計算相對路徑
    const rootPath = fileTreeData ? fileTreeData.path : '/srv';
    const relativePath = path.replace(rootPath, '').replace(/^\//, '');
    
    // 開啟 Modal
    const modal = document.getElementById('viewFileModal');
    const title = document.getElementById('viewFileTitle');
    const loading = document.getElementById('viewFileLoading');
    const error = document.getElementById('viewFileError');
    const errorMessage = document.getElementById('viewFileErrorMessage');
    const textContent = document.getElementById('viewFileTextContent');
    const textElement = document.getElementById('viewFileText');
    const imageContent = document.getElementById('viewFileImageContent');
    const imageElement = document.getElementById('viewFileImage');
    
    // 顯示 Modal 和載入狀態
    modal.classList.remove('hidden');
    loading.classList.remove('hidden');
    error.classList.add('hidden');
    textContent.classList.add('hidden');
    imageContent.classList.add('hidden');
    
    // 設定標題（暫時顯示路徑，之後會更新為檔案名稱）
    title.textContent = '載入中...';
    
    try {
        // 呼叫 API 取得檔案內容
        const response = await fetch(`/api/v1/files/content?path=${encodeURIComponent(relativePath)}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 隱藏載入狀態
        loading.classList.add('hidden');
        
        if (!data.success) {
            throw new Error(data.message || '讀取檔案失敗');
        }
        
        // 更新標題為檔案名稱
        title.textContent = data.name;
        
        // 根據檔案類型顯示內容
        if (data.type === 'text') {
            textElement.textContent = data.content;
            textContent.classList.remove('hidden');
        } else if (data.type === 'image') {
            imageElement.src = `data:image/${getImageMimeType(data.name)};base64,${data.content}`;
            imageContent.classList.remove('hidden');
        } else {
            throw new Error('不支援的檔案類型');
        }
        
    } catch (error) {
        // 隱藏載入狀態
        loading.classList.add('hidden');
        
        // 顯示錯誤訊息
        errorMessage.textContent = error.message || '讀取檔案時發生錯誤';
        error.classList.remove('hidden');
    }
}

// 取得圖片的 MIME 類型
function getImageMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
        'jpg': 'jpeg',
        'jpeg': 'jpeg',
        'png': 'png',
        'gif': 'gif',
        'bmp': 'bmp',
        'svg': 'svg+xml',
        'webp': 'webp',
        'ico': 'x-icon',
        'tiff': 'tiff',
        'tif': 'tiff'
    };
    return mimeTypes[ext] || 'jpeg';
}

// 過濾檔案
function filterFiles(searchTerm) {
    if (!searchTerm) {
        renderFileList(allFiles);
        return;
    }
    
    const filtered = allFiles.filter(file => 
        file.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    renderFileList(filtered);
}

// 取得檔案圖示
function getFileIcon(filename, type) {
    if (type === 'directory') {
        return '📁';
    }
    
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'pdf': '📄',
        'doc': '📝',
        'docx': '📝',
        'xls': '📊',
        'xlsx': '📊',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'png': '🖼️',
        'gif': '🖼️',
        'mp4': '🎬',
        'mp3': '🎵',
        'zip': '📦',
        'rar': '📦',
        'txt': '📄',
        'md': '📄',
        'json': '📄'
    };
    return iconMap[ext] || '📄';
}

// 取得檔案類型
function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const typeMap = {
        'pdf': 'PDF',
        'doc': 'Word',
        'docx': 'Word',
        'xls': 'Excel',
        'xlsx': 'Excel',
        'jpg': '圖片',
        'jpeg': '圖片',
        'png': '圖片',
        'gif': '圖片',
        'mp4': '影片',
        'mp3': '音訊',
        'zip': '壓縮檔',
        'rar': '壓縮檔',
        'txt': '文字檔',
        'md': 'Markdown',
        'json': 'JSON'
    };
    return typeMap[ext] || '檔案';
}

// 顯示錯誤
function showError(message) {
    const tbody = document.getElementById('fileTableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="px-4 py-8 text-center text-red-500">
                ${escapeHtml(message)}
            </td>
        </tr>
    `;
}

// HTML 轉義
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 關閉新增資料夾對話框
function closeCreateFolderModal() {
    const modal = document.getElementById('createFolderModal');
    const form = document.getElementById('createFolderForm');
    modal.classList.add('hidden');
    form.reset();
}

// 建立資料夾
async function createDirectory(folderName) {
    try {
        // 取得當前路徑
        const rootPath = fileTreeData ? fileTreeData.path : '/srv';
        const relativePath = currentPath.replace(rootPath, '').replace(/^\//, '');
        
        const response = await fetch('/api/v1/files/directory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: relativePath || null,
                name: folderName
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || '建立資料夾失敗');
        }
        
        if (data.success) {
            // 關閉對話框
            closeCreateFolderModal();
            
            // 重新載入檔案列表和樹狀圖
            await loadFileList(relativePath);
            await loadFileTree();
            
            // 顯示成功訊息（可選）
            console.log('資料夾建立成功:', data.path);
        } else {
            throw new Error(data.message || '建立資料夾失敗');
        }
        
    } catch (error) {
        console.error('建立資料夾失敗:', error);
        alert('建立資料夾失敗: ' + error.message);
    }
}
