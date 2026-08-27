export class User {
  loggedIn: boolean;

  constructor(private username: string) {
    this.loggedIn = false;
    this.username = username;
  }

  get name(): string {
    return this.username;
  }

  login(username: string): void {
    if (!username) {
      throw new Error("Username is required");
    }
    this.loggedIn = true;
    this.username = username;
  }
}
