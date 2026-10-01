import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

/**
 * Profile pictures for the whole app. Knows who has one (and its version) from one small list
 * loaded after sign-in, and fetches each picture once, as a blob, the first time an avatar asks
 * for it. A picture is only fetched again when its version moves, so the same face in fifty rows
 * is one request.
 *
 * Blobs rather than <img src="/api/...">: an image request cannot carry the sign-in token, and
 * the API keeps its ?access_token= escape hatch to attachments on purpose.
 */
@Injectable({ providedIn: 'root' })
export class AvatarService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  /** userId → current picture version, for people who have one. */
  private readonly versions = signal(new Map<number, number>());
  /** userId → object URL of the picture at its current version. */
  private readonly urls = signal(new Map<number, { version: number; url: string }>());
  private readonly inFlight = new Set<string>();

  constructor() {
    // Load the list for a real account; a guest, or nobody, gets initials only.
    effect(() => {
      const user = this.auth.user();
      untracked(() => {
        if (user && !user.isGuest) this.refresh();
        else this.clear();
      });
    });
  }

  async refresh() {
    try {
      const list = await this.api.avatarVersions();
      this.versions.set(new Map(list.map((a) => [a.userId, a.version])));
    } catch {
      /* no pictures is not an error worth a toast: everyone keeps their initials */
    }
  }

  /**
   * The picture to show for this person, or null for initials. The first call for a new version
   * starts the download and returns null; the avatar re-renders when it arrives.
   */
  src(userId: number | null | undefined): string | null {
    if (!userId) return null;
    const version = this.versions().get(userId);
    if (!version) return null;
    const cached = this.urls().get(userId);
    if (cached?.version === version) return cached.url;
    const key = `${userId}:${version}`;
    if (!this.inFlight.has(key)) {
      this.inFlight.add(key);
      this.api.avatarBlob(userId, version)
        .then((blob) => this.store(userId, version, blob))
        .catch(() => { /* initials stay */ })
        .finally(() => this.inFlight.delete(key));
    }
    return cached?.url ?? null; // the previous picture until the new one lands
  }

  /** After your own upload or removal: shown at once, from the picture already in hand. */
  setOwn(userId: number, version: number, picture: Blob | null) {
    this.versions.update((m) => {
      const next = new Map(m);
      if (picture) next.set(userId, version);
      else next.delete(userId);
      return next;
    });
    if (picture) this.store(userId, version, picture);
    else this.drop(userId);
  }

  private store(userId: number, version: number, blob: Blob) {
    const url = URL.createObjectURL(blob);
    this.urls.update((m) => {
      const next = new Map(m);
      const old = next.get(userId);
      if (old) URL.revokeObjectURL(old.url);
      next.set(userId, { version, url });
      return next;
    });
  }

  private drop(userId: number) {
    this.urls.update((m) => {
      const old = m.get(userId);
      if (!old) return m;
      URL.revokeObjectURL(old.url);
      const next = new Map(m);
      next.delete(userId);
      return next;
    });
  }

  private clear() {
    for (const { url } of this.urls().values()) URL.revokeObjectURL(url);
    this.urls.set(new Map());
    this.versions.set(new Map());
  }
}
