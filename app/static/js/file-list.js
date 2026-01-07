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
});

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
        const response = await fetch('/api/v1/files/tree');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        fileTreeData = data;
        
        renderFileTree(data);
        
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
    li.className = `tree-item ${treeData.type} ${level === 0 ? 'expanded' : ''} py-1 select-none ${treeData.type === 'directory' ? 'font-medium cursor-pointer' : 'cursor-default'}`;
    
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
    
    li.appendChild(iconSpan);
    li.appendChild(labelSpan);
    
    // 子節點
    if (treeData.children && treeData.children.length > 0) {
        const childrenUl = document.createElement('ul');
        childrenUl.className = `tree-children list-none pl-6 mt-1 ${level === 0 ? 'block' : 'hidden'}`;
        
        treeData.children.forEach(child => {
            const childLi = renderTreeItem(child, level + 1);
            childrenUl.appendChild(childLi);
        });
        
        li.appendChild(childrenUl);
        
        // 只有目錄才能展開/收合
        if (treeData.type === 'directory') {
            li.addEventListener('click', function(e) {
                // 如果點擊的是 labelSpan，已經處理了載入目錄，不需要展開/收合
                if (e.target === labelSpan) {
                    return;
                }
                // 如果點擊的是 iconSpan 或其他區域，則展開/收合
                const children = this.querySelector('.tree-children');
                if (children) {
                    children.classList.toggle('hidden');
                    children.classList.toggle('block');
                    this.classList.toggle('expanded');
                }
            });
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
    const li = document.createElement('li');
    li.className = `tree-item ${item.type} py-1 select-none ${item.type === 'directory' ? 'font-medium cursor-pointer' : 'cursor-default'}`;
    
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
    
    li.appendChild(iconSpan);
    li.appendChild(labelSpan);
    
    // 子節點
    if (item.children && item.children.length > 0) {
        const childrenUl = document.createElement('ul');
        childrenUl.className = 'tree-children list-none pl-6 mt-1 hidden';
        
        item.children.forEach(child => {
            const childLi = renderTreeItem(child, level + 1);
            childrenUl.appendChild(childLi);
        });
        
        li.appendChild(childrenUl);
        
        // 只有目錄才能展開/收合
        if (item.type === 'directory') {
            li.addEventListener('click', function(e) {
                // 如果點擊的是 labelSpan，已經處理了載入目錄，不需要展開/收合
                if (e.target === labelSpan) {
                    return;
                }
                // 如果點擊的是 iconSpan 或其他區域，則展開/收合
                const children = this.querySelector('.tree-children');
                if (children) {
                    children.classList.toggle('hidden');
                    children.classList.toggle('block');
                    this.classList.toggle('expanded');
                }
            });
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
function viewFile(path, type) {
    if (type === 'directory') {
        loadDirectory(path);
    } else {
        // 未來實作檔案詳情頁面
        console.log('查看檔案:', path);
    }
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
