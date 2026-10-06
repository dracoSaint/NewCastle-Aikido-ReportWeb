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
        // Redirect to the home page (index.html)
        const homeUrl = new URL('../index.html', window.location.href).href;
        window.location.replace(homeUrl);

      } catch (err) {
        console.error('Login error:', err);
        showError(err.message || 'An unexpected error occurred. Please try again.');
        
        // Reset loading state
        submitBtn.disabled = false;
        btnText.textContent = 'Sign In';
        spinner.hidden = true;
      }
    });

    function showError(message) {
      const errorContainer = document.getElementById('errorMessage');
      const errorText = document.getElementById('errorText');
      errorText.textContent = message;
      errorContainer.hidden = false;
      errorContainer.classList.add('shake');
      setTimeout(() => errorContainer.classList.remove('shake'), 500);
    }