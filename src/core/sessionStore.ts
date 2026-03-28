import type { ProfileSession } from './types';

export class SessionStore {
  private session: ProfileSession | undefined;
  private visible = false;

  public getSession(): ProfileSession | undefined {
    return this.session;
  }

  public hasSession(): boolean {
    return this.session !== undefined;
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public setSession(session: ProfileSession): void {
    this.session = session;
    this.visible = true;
  }

  public toggleVisibility(): boolean | undefined {
    if (!this.session) {
      return undefined;
    }

    this.visible = !this.visible;
    return this.visible;
  }
}
