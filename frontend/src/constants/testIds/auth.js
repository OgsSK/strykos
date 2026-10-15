// Test IDs for the auth feature (login, register, password reset, logout).
// Add new keys here as you wire up additional auth UI; see ./index.js for
// the recipe to add a new feature file.
//
// Directive:
//   - Keys are camelCase, values are kebab-case shaped as `<feature>-<element>`
//     (or `<feature>-<element>-<qualifier>` when an element repeats). Examples:
//     'login-submit-button', 'cart-quantity-input', 'product-card-image'.
//   - Reference them in JSX as `data-testid={LOGIN.submitButton}`.
//
// Why kebab-case values: required by qabot's CSS-attribute selector matcher
// and the lint rule `emergent(kebab-case-testid)`.

export const LOGIN = {
	emailInput: 'login-email-input',
	passwordInput: 'login-password-input',
	submitButton: 'login-submit-button',
	forgotPasswordLink: 'login-forgot-password-link',
	registerLink: 'login-register-link',
};

export const REGISTER = {
	nameInput: 'register-name-input',
	emailInput: 'register-email-input',
	passwordInput: 'register-password-input',
	passwordConfirmInput: 'register-password-confirm-input',
	submitButton: 'register-submit-button',
	loginLink: 'register-login-link',
};

export const LOGOUT = {
	button: 'logout-button',
};

// ⭐ NOUVEAU — flux de confirmation d'email après inscription
export const EMAIL_CONFIRMATION = {
	// Page /login affichée juste après l'inscription (?registered=1)
	registeredBanner: 'auth-registered-banner',
	registeredBannerEmail: 'auth-registered-banner-email',

	// Page /confirm-email (traitement du lien reçu par email)
	page: 'confirm-email-page',
	loading: 'confirm-email-loading',
	success: 'confirm-email-success',
	error: 'confirm-email-error',
	goToAccountButton: 'confirm-email-go-to-account-button',
	loginLink: 'confirm-email-login-link',
	registerLink: 'confirm-email-register-link',
};

// ⭐ NOUVEAU — mot de passe oublié / réinitialisation
export const PASSWORD_RESET = {
	forgotEmailInput: 'forgot-password-email-input',
	forgotSubmitButton: 'forgot-password-submit-button',
	forgotBackToLoginLink: 'forgot-password-back-to-login-link',

	newPasswordInput: 'reset-password-new-input',
	confirmPasswordInput: 'reset-password-confirm-input',
	resetSubmitButton: 'reset-password-submit-button',
	resetBackToLoginLink: 'reset-password-back-to-login-link',
};