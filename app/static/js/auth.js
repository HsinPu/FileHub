/**
 * Files-App 身分驗證處理
 */

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showRegister = document.getElementById('showRegister');
    const showLogin = document.getElementById('showLogin');
    const authMessage = document.getElementById('authMessage');
    const formTitle = document.getElementById('formTitle');

    // 切換到註冊表單
    if (showRegister) {
        showRegister.addEventListener('click', function(e) {
            e.preventDefault();
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            formTitle.textContent = '註冊新帳號';
            hideMessage();
        });
    }

    // 切換到登入表單
    if (showLogin) {
        showLogin.addEventListener('click', function(e) {
            e.preventDefault();
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
            formTitle.textContent = '請登入您的帳號';
            hideMessage();
        });
    }

    // 處理登入提交
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(loginForm);
            
            try {
                const response = await fetch('/api/v1/auth/login', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (response.ok) {
                    // 儲存 Token
                    localStorage.setItem('access_token', data.access_token);
                    localStorage.setItem('token_type', data.token_type);
                    
                    showMessage('登入成功！正在導向...', 'success');
                    
                    // 導向到首頁
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 1000);
                } else {
                    showMessage(data.detail || '登入失敗，請檢查帳號密碼', 'error');
                }
            } catch (error) {
                showMessage('連線發生錯誤', 'error');
                console.error('Login error:', error);
            }
        });
    }

    // 處理註冊提交
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const password = document.getElementById('regPassword').value;
            const confirmPassword = document.getElementById('regConfirmPassword').value;

            if (password !== confirmPassword) {
                showMessage('兩次密碼輸入不一致', 'error');
                return;
            }

            const username = document.getElementById('regUsername').value;
            const fullName = document.getElementById('regFullName').value;

            try {
                const response = await fetch('/api/v1/auth/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username: username,
                        password: password,
                        full_name: fullName
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    showMessage('註冊成功！請登入', 'success');
                    // 自動切換到登入頁面
                    setTimeout(() => {
                        showLogin.click();
                    }, 2000);
                } else {
                    showMessage(data.detail || '註冊失敗', 'error');
                }
            } catch (error) {
                showMessage('連線發生錯誤', 'error');
                console.error('Register error:', error);
            }
        });
    }

    /**
     * 顯示右上角 Toast 訊息
     * @param {string} text 訊息內容
     * @param {string} type 類型 ('success' | 'error')
     */
    function showMessage(text, type) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        // 建立 Toast 元素
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
        const icon = type === 'success' ? '✅' : '❌';

        toast.className = `${bgColor} text-white px-6 py-4 rounded-lg shadow-xl flex items-center gap-3 min-w-[300px] toast-enter`;
        toast.innerHTML = `
            <span class="text-xl">${icon}</span>
            <div class="flex-1 font-medium">${text}</div>
            <button class="ml-2 hover:opacity-70 transition-opacity" onclick="this.parentElement.remove()">✕</button>
        `;

        // 加入容器
        container.appendChild(toast);

        // 4秒後自動移除
        setTimeout(() => {
            toast.classList.replace('toast-enter', 'toast-exit');
            // 等待動畫結束後移除 DOM
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }, 4000);
    }

    function hideMessage() {
        // 現在改用 Toast，不需手動隱藏單一元素
    }
});

// 全域登出函式
function logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('token_type');
    window.location.href = '/login';
}
