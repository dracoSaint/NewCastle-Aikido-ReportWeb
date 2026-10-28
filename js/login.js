    // 3D logo: stack copies of the logo along Z so the spinning coin has thickness (styles: .logo3d).
    const logo3d = document.getElementById('logo3d') || document.createElement('div');
    const face = logo3d.querySelector('img');
    for (let i = 1; face && i < 14; i++) {
      const layer = face.cloneNode();
      layer.style.cssText = `--z:${(i * 0.5).toFixed(1)}px; ${i < 13 ? '--edge:1' : ''}`;
      face.parentNode.appendChild(layer);
    }
    const logoState = (s) => { logo3d.className = 'logo3d' + (s ? ' is-' + s : ''); };

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const errorContainer = document.getElementById('errorMessage');
      const errorText = document.getElementById('errorText');
      const submitBtn = document.getElementById('submitBtn');
      const btnText = submitBtn.querySelector('.btn-text');
      const spinner = submitBtn.querySelector('.spinner');

      // Hide previous errors
      errorContainer.hidden = true;
      errorText.textContent = '';

      // Validate inputs
      if (!email || !password) {
        showError('Please fill in all fields.');
        return;
      }

      // Show loading state
      submitBtn.disabled = true;
      btnText.textContent = 'Signing in...';
      spinner.hidden = false;
      logoState('busy');

      try {
        if (window.authReady) {
          await window.authReady;
        }

        if (!window.supabaseClient) {
          throw new Error('Authentication service is unavailable. Please refresh the page and try again.');
        }

        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          throw error;
        }

        // Success! Supabase will handle storing the token in localStorage.
        // Hold a moment so the green glow is seen before leaving.
        logoState('ok');
        await new Promise((r) => setTimeout(r, 800));
        // Go to the user's start page (Settings > Preferences), else Home.
        const homeUrl = new URL('../index.html', window.location.href).href;
        const startUrl = window.portalStartUrl ? window.portalStartUrl(data.user) : homeUrl;
        // First login of the browser session plays the intro, then leaves while it is still on screen.
        if (playLoginIntro(data.user)) setTimeout(() => window.location.replace(startUrl), 4300);
        else window.location.replace(startUrl);

      } catch (err) {
        console.error('Login error:', err);
        showError(err.message || 'An unexpected error occurred. Please try again.');
        logoState('fail');
        setTimeout(() => { if (logo3d.classList.contains('is-fail')) logoState(); }, 1800);

        // Reset loading state
        submitBtn.disabled = false;
        btnText.textContent = 'Sign In';
        spinner.hidden = true;
      }
    });

    // Login intro: wind and leaves spiral in and the logo's rings spin together (styles: .login-intro in styles.css).
    // Plays once per browser session (session cookie); skipped for reduced motion (OS or Settings > Preferences).
    // Returns true if it played. ?welcome=1 forces a preview, then reloads without it.
    if (new URLSearchParams(location.search).get('welcome') === '1') {
      playLoginIntro(null, true);
      setTimeout(() => location.replace(location.pathname), 4300);
    }
    function playLoginIntro(user, force) {
      if (!force) {
        if (document.cookie.includes('na_intro=1') || user?.user_metadata?.reduce_motion ||
            matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
        document.cookie = 'na_intro=1; path=/; SameSite=Lax';
      }

      const rand = (a, b) => a + Math.random() * (b - a);
      const logo = '../imgs/aikido-logo-white.png';
      // Concentric rings, inner first: [inner %, outer %, start rotation, start scale]. Positive = anticlockwise in.
      const bands = [[0, 32, 760, .5], [31, 56, 560, 1.35], [55, 80, 400, 1.6], [79, 102, 280, 1.85]].map(([a, b, r, s], i) => {
        const vars = `--a:${a}%; --b:${b}%; --r:${r}deg; --s:${s};`;
        return `<div class="login-intro__band is-trail" style="${vars} --delay:${.42 + i * .03}s"><img src="${logo}" alt=""></div>` +
               `<div class="login-intro__band" style="${vars} --delay:${.3 + i * .03}s"><img src="${logo}" alt=""></div>`;
      }).join('');
      let wind = '', leaves = '';
      for (let i = 0; i < 16; i++) {
        const len = rand(10, 28);
        wind += `<svg class="login-intro__wind" viewBox="0 0 100 100" aria-hidden="true" style="--a0:${rand(0, 360).toFixed(0)}deg; --turn:${rand(-560, -300).toFixed(0)}deg;` +
          ` --s0:${rand(1.6, 3.2).toFixed(2)}; --o:${rand(.2, .55).toFixed(2)}; --dur:${rand(1.3, 1.8).toFixed(2)}s; --delay:${rand(0, .55).toFixed(2)}s">` +
          `<circle cx="50" cy="50" r="${rand(40, 50).toFixed(1)}" pathLength="100" stroke-width="${rand(1, 2.2).toFixed(1)}" stroke-dasharray="${len.toFixed(0)} ${(100 - len).toFixed(0)}"/></svg>`;
      }
      for (let i = 0; i < 12; i++) {
        const vars = `--a0:${rand(0, 360).toFixed(0)}deg; --turn:${rand(-620, -360).toFixed(0)}deg; --dur:${rand(1.4, 1.9).toFixed(2)}s; --delay:${rand(0, .5).toFixed(2)}s;`;
        leaves += `<span class="login-intro__orbit" style="${vars}"><span class="login-intro__leaf" style="${vars}` +
          ` --r0:${rand(140, 280).toFixed(0)}px; --w:${rand(8, 16).toFixed(0)}px; --c:${Math.random() < .25 ? '#a8443f' : '#f7f5f3'};` +
          ` --o:${rand(.5, .9).toFixed(2)}; --spin:${rand(-540, -180).toFixed(0)}deg"></span></span>`;
      }

      const el = document.createElement('div');
      el.className = 'login-intro';
      el.setAttribute('role', 'status');
      el.innerHTML =
        '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="li-warp" x="-20%" y="-20%" width="140%" height="140%">' +
          '<feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7"/>' +
          '<feDisplacementMap in="SourceGraphic" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter></svg>' +
        '<div class="login-intro__stage"><div class="login-intro__mark">' +
          '<span class="login-intro__ripple"></span><span class="login-intro__ripple"></span><span class="login-intro__ripple"></span>' +
          '<span class="login-intro__glow"></span>' + wind + leaves + bands +
          `<div class="login-intro__whole"><img src="${logo}" alt=""></div>` +
          '<svg class="login-intro__enso" viewBox="0 0 100 100" aria-hidden="true"><circle class="wash" cx="50" cy="50" r="47" pathLength="100"/><circle class="ink" cx="50" cy="50" r="47" pathLength="100"/></svg>' +
        '</div>' +
        '<p class="login-intro__title">Welcome to Newcastle Aikido</p>' +
        '<span class="login-intro__line"></span>' +
        '<p class="login-intro__sub">Studio Operations Portal</p></div>';
      document.body.appendChild(el);

      // Ease the water warp on the merged icon from rippling to still.
      const map = el.querySelector('feDisplacementMap');
      const start = performance.now() + 1950;
      (function step(now) {
        const t = Math.min(Math.max((now - start) / 1000, 0), 1);
        map.setAttribute('scale', 18 * Math.pow(1 - t, 3));
        if (t < 1) requestAnimationFrame(step);
      })(performance.now());
      return true;
    }

    function showError(message) {
      const errorContainer = document.getElementById('errorMessage');
      const errorText = document.getElementById('errorText');
      errorText.textContent = message;
      errorContainer.hidden = false;
      errorContainer.classList.add('shake');
      setTimeout(() => errorContainer.classList.remove('shake'), 500);
    }