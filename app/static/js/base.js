// Base JavaScript for Files-App

// Navigation active state
document.addEventListener('DOMContentLoaded', function() {
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
});

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
