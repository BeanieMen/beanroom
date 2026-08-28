export class User {
  private username: string;
  public loggedIn = false;

  constructor(username: string) {
    const cleanName = username.trim();
    this.username = cleanName.length > 0 ? cleanName : "Guest";
  }

  get name(): string {
    return this.username;
  }

  login(username: string): void {
    const cleanName = username.trim();
    if (cleanName.length === 0) {
      throw new Error("Username is required");
    }
    this.username = cleanName;
    this.loggedIn = true;
  }

  logout(): void {
    this.loggedIn = false;
  }
}
