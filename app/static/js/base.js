// Base JavaScript for Files-App

// 檢查身分驗證狀態並更新 UI
function checkAuth() {
    const token = localStorage.getItem('access_token');
    const currentPath = window.location.pathname;
    const isLoginPage = currentPath === '/login' || currentPath.endsWith('login');

    // 更新導航列狀態
    const authNav = document.getElementById('authNav');
    if (authNav) {
        if (token) {
            authNav.innerHTML = `
                <button onclick="toggleSettingsModal()" class="p-2 text-gray-600 hover:text-blue-500 hover:bg-gray-100 rounded-lg transition-all" title="系統設定">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    </svg>
                </button>
            `;
            // 如果在首頁或檔案列表，順便獲取當前用戶名
            fetchUserInfo();
        } else {
            authNav.innerHTML = `<a href="/login" class="text-blue-500 font-medium hover:bg-blue-50 px-4 py-2 rounded-lg transition-all border border-blue-200">登入</a>`;
        }
    }
    return true;
}

// 獲取使用者資訊以顯示在設定中
async function fetchUserInfo() {
    const display = document.getElementById('currentUserDisplay');
    if (!display) return;

    try {
        const response = await authenticatedFetch('/api/v1/auth/me');
        if (response.ok) {
            const user = await response.json();
            display.textContent = user.full_name || user.username;
        }
    } catch (error) {
        console.error('Failed to fetch user info:', error);
    }
}

// 切換設定視窗顯示/隱藏
function toggleSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    modal.classList.toggle('hidden');
}

// 切換設定頁籤
function switchSettingsTab(tabId) {
    // 切換內容面板
    const panels = document.querySelectorAll('.settings-content-panel');
    panels.forEach(p => p.classList.add('hidden'));
    
    const targetPanel = document.getElementById(`${tabId}Settings`);
    if (targetPanel) targetPanel.classList.remove('hidden');

    // 更新選單樣式
    const buttons = document.querySelectorAll('.settings-tab-btn');
    buttons.forEach(btn => {
        btn.classList.remove('bg-blue-50', 'text-blue-600', 'font-medium');
        btn.classList.add('text-gray-600', 'hover:bg-gray-100');
    });

    const activeBtn = document.querySelector(`.settings-tab-btn[data-tab="${tabId}"]`);
    if (activeBtn) {
        activeBtn.classList.add('bg-blue-50', 'text-blue-600', 'font-medium');
        activeBtn.classList.remove('text-gray-600', 'hover:bg-gray-100');
    }

    // 更新標題
    const titleMap = {
        'account': '帳號設定',
        'system': '系統偏好'
    };
    const title = document.getElementById('settingsTitle');
    if (title) title.textContent = titleMap[tabId];
}

// 全域登出函式 (移動到 base.js 方便全域呼叫)
function logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('token_type');
    window.location.href = '/login';
}

/**
 * 處理密碼更新
 */
async function handleUpdatePassword() {
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;

    if (!newPassword) {
        showToast('請輸入新密碼', 'error');
        return;
    }

    if (newPassword.length < 8) {
        showToast('新密碼長度至少需要 8 位數', 'error');
        return;
    }

    if (newPassword !== confirmNewPassword) {
        showToast('兩次密碼輸入不一致', 'error');
        return;
    }

    try {
        const response = await authenticatedFetch('/api/v1/auth/password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                new_password: newPassword
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('密碼已成功更新！', 'success');
            // 清除欄位
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmNewPassword').value = '';
        } else {
            showToast(data.detail || '密碼更新失敗', 'error');
        }
    } catch (error) {
        console.error('Password update error:', error);
        showToast('連線發生錯誤', 'error');
    }
}

/**
 * 顯示右上角 Toast 訊息 (全域版本)
 */
function showToast(text, type) {
    let container = document.getElementById('toastContainer');
    
    // 如果容器不存在（例如不在登入頁），則建立它
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'fixed top-4 right-4 z-[100] flex flex-col gap-3 min-w-[300px]';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
    const icon = type === 'success' ? '✅' : '❌';

    // 這裡我們需要動態加入動畫類別
    toast.className = `${bgColor} text-white px-6 py-4 rounded-lg shadow-xl flex items-center gap-3 min-w-[300px] transition-all duration-300 transform translate-x-full opacity-0`;
    toast.innerHTML = `
        <span class="text-xl">${icon}</span>
        <div class="flex-1 font-medium">${text}</div>
        <button class="ml-2 hover:opacity-70 transition-opacity" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    // 強制重繪以觸發動畫
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
        toast.classList.add('translate-x-0', 'opacity-1');
    });

    // 4秒後移除
    setTimeout(() => {
        toast.classList.remove('translate-x-0', 'opacity-1');
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// 封裝 fetch 以自動加入 Authorization 標頭
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('access_token');
    console.log(`[Fetch] URL: ${url}, Has Token: ${!!token}`);
    
    if (token) {
        if (!options.headers) {
            options.headers = {};
        }
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, options);

    if (response.status === 401) {
        console.warn(`[Fetch] 401 Unauthorized for ${url}, redirecting...`);
        // Token 失效，清除並導向登入頁
        localStorage.removeItem('access_token');
        window.location.href = '/login';
    }

    return response;
}

// Navigation active state
document.addEventListener('DOMContentLoaded', function() {
    // 檢查驗證
    checkAuth();

    // Set active navigation link based on current page
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link, .sidebar-link');
    
    navLinks.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('text-blue-500', 'font-semibold');
        }
    });

    // Mobile menu toggle (if needed in future)
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', function() {
            const sidebar = document.querySelector('.sidebar');
            sidebar.classList.toggle('active');
        });
    }

    // File upload drag and drop (placeholder for future implementation)
    const uploadAreas = document.querySelectorAll('.upload-area');
    uploadAreas.forEach(area => {
        area.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('border-blue-500', 'bg-blue-100');
        });

        area.addEventListener('dragleave', function(e) {
            e.preventDefault();
            this.classList.remove('border-blue-500', 'bg-blue-100');
        });

        area.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('border-blue-500', 'bg-blue-100');
            // File upload logic will be implemented later
        });
    });

    // File tree toggle functionality
    const treeFolders = document.querySelectorAll('.tree-item.folder');
    treeFolders.forEach(folder => {
        folder.addEventListener('click', function(e) {
            // Don't toggle if clicking on a file inside
            if (e.target.closest('.tree-item.file')) {
                return;
            }
            const children = this.querySelector('.tree-children');
            if (children) {
                children.classList.toggle('hidden');
                children.classList.toggle('block');
                this.classList.toggle('expanded');
            }
        });
    });
    
    // Sidebar toggle functionality
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    
    if (sidebarToggle && sidebar) {
        // 從 localStorage 讀取上次的狀態
        const savedState = localStorage.getItem('sidebarCollapsed');
        if (savedState === 'true') {
            sidebar.classList.add('collapsed');
        }
        
        sidebarToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleSidebar();
        });
    }
});

// 切換側邊欄顯示/隱藏
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    const isCollapsed = sidebar.classList.contains('collapsed');
    
    if (isCollapsed) {
        // 展開
        sidebar.classList.remove('collapsed');
        localStorage.setItem('sidebarCollapsed', 'false');
    } else {
        // 收合
        sidebar.classList.add('collapsed');
        localStorage.setItem('sidebarCollapsed', 'true');
    }
}

// Utility functions
const utils = {
    formatFileSize: function(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    },

    formatDate: function(date) {
        return new Date(date).toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    getFileIcon: function(filename) {
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
            'rar': '📦'
        };
        return iconMap[ext] || '📄';
    }
};

// Export utils for use in other scripts
window.FilesApp = {
    utils: utils
};
