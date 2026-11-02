/* ============================================================
   Gate — Password Protection Frontend Script (v4)
   防 F12 / View Source：验证通过后从服务端加载页面内容

   原理：
     - HTML 文件中不含任何页面内容，F12 / Ctrl+U 看到的只有密码弹窗
     - 验证通过后，用 token 向 Worker 的 /api/content 请求内容
     - Worker 验证 token 有效后，返回存储在 KV 中的页面 HTML
     - JS 将返回的 HTML 注入 DOM，然后执行其中的 <script>

   用法：
     1. 在 <head> 或 <body> 中引入：<script src="gate.js"></script>
     2. 在 <body> 开头放入 gate.html 中的 HTML 片段
     3. 受保护内容存储在 KV 中（key: content:default，value: 完整 HTML 字符串）
     4. 修改下方 GATE_API 为你的 Worker URL
   ============================================================ */

(function () {
  // ⚠️ 必改：替换为你的 Cloudflare Worker URL
  const GATE_API = 'https://resume-gate.yzglj.eu.org/api/verify';
  const CONTENT_API = 'https://resume-gate.yzglj.eu.org/api/content';

  // Token 在 localStorage 中的 key（可自定义）
  const STORAGE_KEY = 'gate_session_token';

  // ---- 确保 submitGate 挂载到 window（即使 DOM 尚未就绪也不会报错） ----
  // 先声明一个占位函数，后续替换为真正的实现
  window.submitGate = function () {
    console.warn('[Gate] submitGate called before init, retrying...');
    setTimeout(function () { window.submitGate(); }, 100);
  };

  // ---- 初始化：等 DOM 元素就绪 ----
  function init() {
  // ---- DOM ----
  const overlay    = document.getElementById('gateOverlay');
  const container  = document.getElementById('lockedContent');
  const input      = document.getElementById('gateInput');
  const btn        = document.getElementById('gateBtn');
  const errorEl    = document.getElementById('gateError');

  if (!overlay || !input || !btn) {
    console.warn('[Gate] 未找到必要的 DOM 元素，请确认 HTML 片段已插入。');
    return;
  }

  // ---- 防窥探：全程禁用右键、F12、Ctrl+U、Ctrl+Shift+I/J/C ----
  // 注意：F12 是浏览器级快捷键，JS 无法完全拦截
  // 但因为页面内容不在 HTML 中，即使打开 DevTools 也看不到受保护内容
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

  // ---- 页面加载时：检查已存的 token ----
  const savedToken = localStorage.getItem(STORAGE_KEY);
  if (savedToken) {
    verifyToken(savedToken, true);
  }

  // ---- 工具函数 ----
  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.classList.add('show');
  }

  function clearError() {
    if (!errorEl) return;
    errorEl.classList.remove('show');
  }

  // 验证通过：用 token 从服务端加载受保护的页面内容
  async function unlock(token) {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';

    if (!container) return;

    // 如果没有 token（网络错误降级），无法加载内容
    if (!token) {
      container.innerHTML = '<p style="text-align:center;padding:40px;color:#888;">加载内容失败，请刷新重试。</p>';
      return;
    }

    // 用 token 向 Worker 请求受保护的页面内容
    // 使用 Raw 模式（Accept: text/html），直接返回 HTML 文本
    // 避免 JSON 序列化/反序列化导致的空白字符丢失
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

      // 检查返回类型
      const contentType = res.headers.get('Content-Type') || '';

      if (contentType.includes('text/html')) {
        // Raw 模式：直接读取 HTML 文本，零损耗
        const html = await res.text();

        if (!html) {
          container.innerHTML = '<p style="text-align:center;padding:40px;color:#888;">内容为空。</p>';
          return;
        }

        // 使用 document.write 写入整个文档
        // 这样浏览器以完整 HTML 文档方式解析，保留 white-space CSS 规则
        // innerHTML 注入会丢失文档级样式上下文，导致空白折叠
        document.open();
        document.write(html);
        document.close();
        return;
      } else {
        // JSON 模式降级（兼容旧版 Worker）
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

  // ---- 用 token 静默验证（已有会话） ----
  async function verifyToken(token, isSilent) {
    try {
      const res = await fetch(GATE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token }),
      });
      const data = await res.json();
      if (data.valid) {
        // 验证通过，用 token 加载内容
        unlock(token);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        if (!isSilent) showError(data.message || '验证失败');
      }
    } catch (e) {
      if (!isSilent) {
        showError('网络错误，请重试');
      }
      // 网络错误时不降级加载（因为需要 token 从服务端取内容）
    }
  }

  // ---- 用密码验证 ----
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
        // 验证通过，用 token 加载内容
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

  // ---- Enter 键提交 ----
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submitGate();
  });
  input.addEventListener('input', clearError);

  // ---- 防窥探：检测 DevTools 打开（全程生效） ----
  // 即使 F12 无法拦截，内容从服务端加载，DevTools 中也只能看到密码弹窗
  // debugger 检测作为辅助：如果 DevTools 打开，清空已加载的内容
  setInterval(function () {
    const start = performance.now();
    debugger;
    if (performance.now() - start > 200) {
      if (container) container.innerHTML = '';
    }
  }, 3000);
  } // ---- end init() ----

  // 确保 DOM 就绪后执行 init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
