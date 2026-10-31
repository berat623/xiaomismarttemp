/**
 * Models — Sayısal Hava Tahmin Modelleri İstasyonu
 * Ultra-Hafif, Sıfır Animasyon & Pastel Minimalist Çekirdek Kontrolcü
 */

class AppController {
  constructor() {
    this.theme = localStorage.getItem('models_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    this.dom = {
      btnThemeToggle: document.getElementById('btnThemeToggle'),
      themeIcon: document.getElementById('themeIcon'),
      toastContainer: document.getElementById('toastContainer'),
      metaThemeColor: document.getElementById('metaThemeColor')
    };

    this.init();
  }

  init() {
    this.applyTheme(this.theme);
    this.bindEvents();
  }

  bindEvents() {
    if (this.dom.btnThemeToggle) {
      this.dom.btnThemeToggle.addEventListener('click', () => {
        const nextTheme = this.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme(nextTheme);
      });
    }

    // Sistem teması değişimini dinle
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('models_theme')) {
        this.applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  applyTheme(theme) {
    this.theme = theme;
    localStorage.setItem('models_theme', theme);

    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      if (this.dom.metaThemeColor) this.dom.metaThemeColor.setAttribute('content', '#0f141c');
    } else {
      document.documentElement.classList.remove('dark');
      if (this.dom.metaThemeColor) this.dom.metaThemeColor.setAttribute('content', '#e2e8f0');
    }

    if (this.dom.themeIcon) {
      this.dom.themeIcon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    }
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }

    // Grafikleri yeni temaya adapte et
    if (window.modelsUI && window.modelsUI.chartManager) {
      window.modelsUI.chartManager.updateTheme();
    }
  }

  showToast(message, type = 'info') {
    if (!this.dom.toastContainer) return;

    const toast = document.createElement('div');
    const colors = {
      success: 'bg-[#15803d] text-white border border-[#166534]',
      error: 'bg-[#b91c1c] text-white border border-[#991b1b]',
      info: 'bg-[#334155] text-white border border-[#1e293b]'
    };

    toast.className = `p-3 rounded-xl shadow-lg text-xs font-bold flex items-center justify-between gap-2 pointer-events-auto transition-opacity duration-200 ${colors[type] || colors.info}`;
    toast.textContent = message;

    this.dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }
}

// Global bootstrap
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
