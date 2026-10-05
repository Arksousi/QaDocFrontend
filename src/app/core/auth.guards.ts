import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Signed-in users only. A stranger is sent to Login with the address they wanted, so a shared
 * ticket link still opens that ticket after signing in — the launcher is skipped for a deep link.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.user() ? true : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Where a signed-in user goes when the page is not for them: the launcher, not a specific app. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAdmin() ? true : inject(Router).createUrlTree(['/home']);
};

export const leaderGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.canLead() ? true : inject(Router).createUrlTree(['/home']);
};

/** The Login page is pointless when already signed in. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() ? inject(Router).createUrlTree(['/home']) : true;
};

/** A real account only: a guest tour has no profile to show or edit. */
export const accountGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() && !auth.isGuest() ? true : inject(Router).createUrlTree(['/home']);
};
