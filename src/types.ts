export interface Gist {
  url: string;

  description: string;

  createdAt: string;

  updatedAt: string;

  files: {
    filename: string;

    content: string;
  }[];

  comments: {
    createdAt: string;

    updatedAt: string;

    user: {
      username: string;

      avatarUrl: string;
    };

    body: string;
  }[];
}
