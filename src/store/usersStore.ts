import type { Role } from "../config/permissions";

export type StoredUser = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  password: string;
  createdAt: string;
  updatedAt: string;
};

let nextId = 3;
let listeners: Array<() => void> = [];

const seedUsers: StoredUser[] = [
  {
    id: "1",
    fullName: "Super Admin",
    email: "superadmin@example.com",
    role: "SUPER_ADMIN",
    isActive: true,
    password: "Password@123",
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
  },
  {
    id: "2",
    fullName: "Alice Johnson",
    email: "alice@example.com",
    role: "ADMIN",
    isActive: true,
    password: "Password@123",
    createdAt: "2025-01-05",
    updatedAt: "2025-01-05",
  },
];

let users: StoredUser[] = [...seedUsers];

function notify() {
  for (const fn of listeners) fn();
}

export const usersStore = {
  getAll(): StoredUser[] {
    return users;
  },

  findByEmail(email: string): StoredUser | undefined {
    return users.find((u) => u.email === email);
  },

  findById(id: string): StoredUser | undefined {
    return users.find((u) => u.id === id);
  },

  addUser(fullName: string, email: string, role: Role, password: string): StoredUser {
    const now = new Date().toISOString().slice(0, 10);
    const user: StoredUser = {
      id: String(nextId++),
      fullName,
      email,
      role,
      isActive: true,
      password,
      createdAt: now,
      updatedAt: now,
    };
    users = [user, ...users];
    notify();
    return user;
  },

  updateRole(id: string, role: Role) {
    users = users.map((u) =>
      u.id === id
        ? { ...u, role, updatedAt: new Date().toISOString().slice(0, 10) }
        : u,
    );
    notify();
  },

  deactivate(id: string) {
    users = users.map((u) =>
      u.id === id
        ? { ...u, isActive: false, updatedAt: new Date().toISOString().slice(0, 10) }
        : u,
    );
    notify();
  },

  resetPassword(id: string, newPassword: string) {
    users = users.map((u) =>
      u.id === id
        ? { ...u, password: newPassword, updatedAt: new Date().toISOString().slice(0, 10) }
        : u,
    );
    notify();
  },

  subscribe(fn: () => void): () => void {
    listeners = [...listeners, fn];
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },
};
