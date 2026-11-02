(function () {
  const GATE_API = 'https://resume-gate.yzglj.eu.org/api/verify';
  const CONTENT_API = 'https://resume-gate.yzglj.eu.org/api/content';

  const STORAGE_KEY = 'gate_session_token';

  window.submitGate = function () {
    console.warn('[Gate] submitGate called before init, retrying...');
    setTimeout(function () { window.submitGate(); }, 100);
  };

  function init() {
  const overlay    = document.getElementById('gateOverlay');
  const container  = document.getElementById('lockedContent');
  const input      = document.getElementById('gateInput');
  const btn        = document.getElementById('gateBtn');
  const errorEl    = document.getElementById('gateError');

  if (!overlay || !input || !btn) {
    console.warn('[Gate] 未找到必要的 DOM 元素，请确认 HTML 片段已插入。');
    return;
  }

   function disableDevtools(e) {
    if (e.keyCode === 123) { e.preventDefault(); return false; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && [73, 74, 67].includes(e.keyCode)) {
      e.preventDefault(); return false;
    }
    if ((e.ctrlKey || e.metaKey) && e.keyCode === 85) {
      e.preventDefault(); return false;
    }
  }

  function disableRightClick(e) {
    e.preventDefault();
    return false;
  }

  document.addEventListener('keydown', disableDevtools);
  document.addEventListener('contextmenu', disableRightClick);

  const savedToken = localStorage.getItem(STORAGE_KEY);
  if (savedToken) {
    verifyToken(savedToken, true);
  }

  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.classList.add('show');
  }

  function clearError() {
    if (!errorEl) return;
    errorEl.classList.remove('show');
  }

  async function unlock(token) {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';

    if (!container) return;

    if (!token) {
      container.innerHTML = '<p style="text-align:center;padding:40px;color:#888;">加载内容失败，请刷新重试。</p>';
      return;
    }

    try {
      const res = await fetch(CONTENT_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/html',
        },
        body: JSON.stringify({ token: token }),
      });

      if (!res.ok) {
        container.innerHTML = '<p style="text-align:center;padding:40px;color:#888;">加载内容失败，请刷新重试。</p>';
        return;
      }

      const contentType = res.headers.get('Content-Type') || '';

      if (contentType.includes('text/html')) {
        const html = await res.text();

        if (!html) {
          container.innerHTML = '<p style="text-align:center;padding:40px;color:#888;">内容为空。</p>';
          return;
        }

        document.open();
        document.write(html);
        document.close();
        return;
      } else {
        const data = await res.json();
        if (data.valid && data.html) {
          document.open();
          document.write(data.html);
          document.close();
          return;
        } else {
          container.innerHTML = '<p style="text-align:center;padding:40px;color:#888;">' + (data.message || '内容未配置') + '</p>';
          return;
        }
      }

    } catch (e) {
      container.innerHTML = '<p style="text-align:center;padding:40px;color:#888;">加载内容失败，请刷新重试。</p>';
    }
  }

  async function verifyToken(token, isSilent) {
    try {
      const res = await fetch(GATE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token }),
      });
      const data = await res.json();
      if (data.valid) {
        unlock(token);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        if (!isSilent) showError(data.message || '验证失败');
      }
    } catch (e) {
      if (!isSilent) {
        showError('网络错误，请重试');
      }
    }
  }

  window.submitGate = async function () {
    const password = input.value.trim();
    if (!password) {
      showError('请输入密码');
      return;
    }
    clearError();
    btn.disabled = true;
    btn.textContent = '验证中…';

    try {
      const res = await fetch(GATE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password }),
      });
      const data = await res.json();

      if (data.valid) {
        if (data.token) {
          localStorage.setItem(STORAGE_KEY, data.token);
        }
        unlock(data.token);
      } else {
        showError(data.message || '密码错误');
        btn.disabled = false;
        btn.textContent = '验证';
        input.value = '';
        input.focus();
      }
    } catch (e) {
      showError('网络错误，请检查连接');
      btn.disabled = false;
      btn.textContent = '验证';
    }
  };

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submitGate();
  });
  input.addEventListener('input', clearError);

  setInterval(function () {
    const start = performance.now();
    debugger;
    if (performance.now() - start > 200) {
      if (container) container.innerHTML = '';
    }
  }, 3000);
  } 
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
