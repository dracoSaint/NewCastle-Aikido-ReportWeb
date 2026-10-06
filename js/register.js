const form = document.getElementById('registerForm');
const errorContainer = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const submitBtn = document.getElementById('submitBtn');
const btnText = submitBtn.querySelector('.btn-text');
const spinner = submitBtn.querySelector('.spinner');

function showError(message) {
    errorText.textContent = message;
    errorContainer.hidden = false;
}

async function waitForInviteSession() {
    if (!window.supabaseClient) {
    setTimeout(waitForInviteSession, 50);
    return;
    }

    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) showError('This invitation link is invalid or has expired. Please request a new invitation.');
}

waitForInviteSession().catch(error => showError(error.message));

form.addEventListener('submit', async event => {
    event.preventDefault();
    errorContainer.hidden = true;

    const fullName = document.getElementById('fullName').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password.length < 8) return showError('Password must be at least 8 characters.');
    if (password !== confirmPassword) return showError('Passwords do not match.');

    submitBtn.disabled = true;
    btnText.textContent = 'Creating Account...';
    spinner.hidden = false;

    try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) throw new Error('This invitation link is invalid or has expired. Please request a new invitation.');

    const { error } = await window.supabaseClient.auth.updateUser({
        password,
        data: { full_name: fullName }
    });
    if (error) throw error;

    window.location.replace('../index.html');
    } catch (error) {
    showError(error.message || 'Unable to complete registration.');
    submitBtn.disabled = false;
    btnText.textContent = 'Create Account';
    spinner.hidden = true;
    }
});