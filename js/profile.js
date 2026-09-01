// ── Populate user info on load ─────────────────────────────────────────
async function loadUserData() {
    if (!window.supabaseClient) { setTimeout(loadUserData, 50); return; }

    try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session?.user) return;

    const user = session.user;
    const fullName = user.user_metadata?.full_name || '';
    const email    = user.email || '';

    // Populate hero banner
    document.getElementById('heroName').textContent  = fullName || 'No display name set';
    document.getElementById('heroEmail').textContent = email;
    document.getElementById('profileAvatar').textContent =
        fullName ? fullName.charAt(0).toUpperCase() : email.charAt(0).toUpperCase();

    // Populate form fields
    document.getElementById('displayName').value  = fullName;
    document.getElementById('profileEmail').value = email;

    } catch (err) {
    console.error('Failed to load user data:', err);
    }
}

// ── Profile details form ───────────────────────────────────────────────
document.getElementById('profileDetailsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const displayName = document.getElementById('displayName').value.trim();
    const email       = document.getElementById('profileEmail').value.trim();
    const submitBtn   = document.getElementById('profileSubmitBtn');
    const btnText     = submitBtn.querySelector('.btn-text');
    const spinner     = submitBtn.querySelector('.spinner');

    clearAlert('profile');

    if (!email) { showAlert('profile', 'error', 'Email address cannot be empty.'); return; }

    setLoading(submitBtn, btnText, spinner, true, 'Saving...');

    try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const currentEmail = session.user.email;

    // Update display name
    const { error: nameErr } = await window.supabaseClient.auth.updateUser({
        data: { full_name: displayName }
    });
    if (nameErr) throw nameErr;

    // Update email only if changed
    let extra = '';
    if (email.toLowerCase() !== currentEmail.toLowerCase()) {
        const { error: emailErr } = await window.supabaseClient.auth.updateUser({ email });
        if (emailErr) throw emailErr;
        extra = ' A confirmation link has been sent to your new email address.';
    }

    // Refresh hero banner
    document.getElementById('heroName').textContent = displayName || 'No display name set';
    document.getElementById('profileAvatar').textContent =
        displayName ? displayName.charAt(0).toUpperCase() : email.charAt(0).toUpperCase();

    showAlert('profile', 'success', 'Profile saved successfully!' + extra);

    } catch (err) {
    console.error('Profile update error:', err);
    showAlert('profile', 'error', err.message || 'Failed to update profile.');
    } finally {
    setLoading(submitBtn, btnText, spinner, false, 'Save Changes');
    }
});

// ── Password form ──────────────────────────────────────────────────────
document.getElementById('profileSecurityForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const oldPw      = document.getElementById('oldPassword').value;
    const newPw      = document.getElementById('newPassword').value;
    const confirmPw  = document.getElementById('confirmPassword').value;
    const submitBtn  = document.getElementById('securitySubmitBtn');
    const btnText    = submitBtn.querySelector('.btn-text');
    const spinner    = submitBtn.querySelector('.spinner');

    clearAlert('security');

    if (!oldPw) { showAlert('security', 'error', 'Please enter your old password.'); return; }

    // ── Validate against all three rules ──────────────────────────────────
    const rules = getPasswordRules(newPw);
    if (!rules.length)   { showAlert('security', 'error', 'Password must be at least 8 characters.');         return; }
    if (!rules.upper)    { showAlert('security', 'error', 'Password must contain at least one uppercase letter (A–Z).'); return; }
    if (!rules.special)  { showAlert('security', 'error', 'Password must contain at least one special character (!@#$%^&*…)'); return; }
    if (newPw !== confirmPw) { showAlert('security', 'error', 'Passwords do not match.'); return; }

    setLoading(submitBtn, btnText, spinner, true, 'Updating...');

    try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session?.user?.email) throw new Error('Unable to verify the current user.');

    const { error: verifyError } = await window.supabaseClient.auth.signInWithPassword({
        email: session.user.email,
        password: oldPw
    });
    if (verifyError) throw new Error('Old password is incorrect.');

    const { error: updateError } = await window.supabaseClient.auth.updateUser({ password: newPw });
    if (updateError) throw updateError;

    showAlert('security', 'success', 'Password updated successfully!');
    document.getElementById('oldPassword').value     = '';
    document.getElementById('newPassword').value    = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('pwMatchIndicator').hidden = true;

    } catch (err) {
    console.error('Password update error:', err);
    showAlert('security', 'error', err.message || 'Failed to update password.');
    } finally {
    setLoading(submitBtn, btnText, spinner, false, 'Update Password');
    }
});

// ── Live password requirements checker ────────────────────────────────
function getPasswordRules(pw) {
    return {
    length:  pw.length >= 8,
    upper:   /[A-Z]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw)
    };
}

document.getElementById('newPassword').addEventListener('input', function () {
    const pw    = this.value;
    const rules = getPasswordRules(pw);

    setReq('req-length',  rules.length);
    setReq('req-upper',   rules.upper);
    setReq('req-special', rules.special);

    // Also refresh match indicator when new-password changes
    updateMatchIndicator();
});

document.getElementById('oldPassword').addEventListener('input', function () {
    const enabled = Boolean(this.value);
    document.getElementById('newPassword').disabled = !enabled;
    document.getElementById('confirmPassword').disabled = !enabled;
});

function setReq(id, passed) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('req-pass', passed);
    el.classList.toggle('req-fail', !passed && el.classList.contains('req-touched'));
}

// Mark requirements as "touched" once the user starts typing
document.getElementById('newPassword').addEventListener('blur', function () {
    document.querySelectorAll('.req').forEach(el => el.classList.add('req-touched'));
    // Re-run to apply fail colours
    const pw    = this.value;
    const rules = getPasswordRules(pw);
    setReq('req-length',  rules.length);
    setReq('req-upper',   rules.upper);
    setReq('req-special', rules.special);
});

// ── Password match indicator ───────────────────────────────────────────
['newPassword', 'confirmPassword'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateMatchIndicator);
});

function updateMatchIndicator() {
    const pw1 = document.getElementById('newPassword').value;
    const pw2 = document.getElementById('confirmPassword').value;
    const indicator = document.getElementById('pwMatchIndicator');

    if (!pw2) { indicator.hidden = true; return; }

    indicator.hidden = false;
    if (pw1 === pw2) {
    indicator.textContent = '✓ Passwords match';
    indicator.className = 'pw-match-indicator match';
    } else {
    indicator.textContent = '✗ Passwords do not match';
    indicator.className = 'pw-match-indicator no-match';
    }
}

// ── Password visibility toggles ────────────────────────────────────────
document.querySelectorAll('.profile-pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    btn.textContent = isText ? '👁' : '🙈';
    });
});

// ── Shared helpers ─────────────────────────────────────────────────────
function showAlert(prefix, type, message) {
    const alertDiv = document.getElementById(prefix + 'Alert');
    alertDiv.className = `profile-alert ${type}`;
    alertDiv.querySelector('.alert-icon').textContent = type === 'success' ? '✓' : '⚠️';
    alertDiv.querySelector('.alert-text').textContent = message;
    alertDiv.hidden = false;
}

function clearAlert(prefix) {
    const alertDiv = document.getElementById(prefix + 'Alert');
    alertDiv.hidden = true;
    alertDiv.className = 'profile-alert';
}

function setLoading(btn, textEl, spinnerEl, isLoading, label) {
    btn.disabled         = isLoading;
    textEl.textContent   = label;
    spinnerEl.hidden     = !isLoading;
}

// Boot
loadUserData();
