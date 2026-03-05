export type LoginBody = {
  email: string;
  password: string;
};

export type RefreshBody = {
  refreshToken: string;
};

export type LogoutBody = {
  refreshToken: string;
};

export type PublicUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};
