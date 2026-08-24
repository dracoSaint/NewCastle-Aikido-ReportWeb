(function () {
  // Determine site root dynamically from the location of this script
  const scriptUrl = new URL(document.currentScript.src);
  const siteRoot = new URL('../', scriptUrl);
  const loginUrl = new URL('login.html', siteRoot).href;
  const registerUrl = new URL('register.html', siteRoot).href;
  const registerErrorUrl = new URL('register-error.html', siteRoot).href;
  const resetUrl = new URL('reset-password.html', siteRoot).href;
  const homeUrl = new URL('index.html', siteRoot).href;

  const inviteParams = new URLSearchParams(window.location.hash.slice(1));
  const isInviteLink = inviteParams.get('type') === 'invite' &&
                       Boolean(inviteParams.get('access_token')) &&
                       Boolean(inviteParams.get('refresh_token'));
  const currentUrlClean = window.location.href.split('?')[0].split('#')[0].toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  
  const isLoginPage = currentUrlClean === loginUrl.toLowerCase() || 
                      pathname.endsWith('/login') || 
                      pathname === 'login';
                      
  const isResetPage = currentUrlClean === resetUrl.toLowerCase() || 
                      pathname.endsWith('/reset-password') || 
                      pathname === 'reset-password';
  const isRegisterPage = currentUrlClean === registerUrl.toLowerCase() ||
                         pathname.endsWith('/register') ||
                         pathname === 'register';
                      
  const isBypassPage = isLoginPage || isResetPage || isRegisterPage;

  if (isInviteLink && !isRegisterPage) {
    window.location.replace(registerUrl + window.location.hash);
    return;
  }

  if (isRegisterPage && !isInviteLink) {
    window.location.replace(registerErrorUrl);
    return;
  }

  // Fast synchronous check using localStorage
  const projectRef = 'knnzybqudpdxhddcaxcv';
  const tokenKey = `sb-${projectRef}-auth-token`;
  const hasLocalSession = localStorage.getItem(tokenKey);

  if (!hasLocalSession && !isBypassPage) {
    // Force redirect to login page immediately before parsing the rest of the document
    window.location.replace(loginUrl);
    return;
  }

  // Function to load a script dynamically
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load authentication resource: ${src}`));
      document.head.appendChild(script);
    });
  }

  // Asynchronous session validation with Supabase
  async function initAuth() {
    // 1. Ensure supabase library is loaded
    if (typeof supabase === 'undefined') {
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    }

    // 2. Ensure config is loaded
    if (typeof config === 'undefined') {
      const configUrl = new URL('js/config.js', siteRoot).href;
      await loadScript(configUrl);
    }

    // Initialize Supabase client
    const supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    window.supabaseClient = supabaseClient;

    // Retrieve active session
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session && !isBypassPage) {
      // Token exists locally but session is invalid/expired
      localStorage.removeItem(tokenKey);
      window.location.replace(loginUrl);
      return;
    } else if (session && isLoginPage) {
      // User is authenticated but trying to access the login page
      window.location.replace(homeUrl);
      return;
    }

    // Setup Logout Button Event Listener
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setupLogoutButton(supabaseClient, tokenKey);
      });
    } else {
      setupLogoutButton(supabaseClient, tokenKey);
    }
  }

  function setupLogoutButton(supabaseClient, tokenKey) {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        // Show loading state on button
        const originalText = logoutBtn.textContent;
        logoutBtn.textContent = 'Logging out...';
        logoutBtn.disabled = true;

        try {
          const { error } = await supabaseClient.auth.signOut();
          if (error) {
            console.error('Logout error from Supabase:', error);
            alert('Error logging out: ' + error.message);
            logoutBtn.textContent = originalText;
            logoutBtn.disabled = false;
          } else {
            localStorage.removeItem(tokenKey);
            window.location.replace(loginUrl);
          }
        } catch (err) {
          console.error('Logout catch error:', err);
          localStorage.removeItem(tokenKey);
          window.location.replace(loginUrl);
        }
      });
    }
  }

  // Start background validation
  window.authReady = initAuth();
  window.authReady.catch(err => {
    console.error('Auth initialization check failed:', err);
  });
})();
