export const CHROME_FIXTURE = {
  roots: {
    bookmark_bar: {
      type: "folder",
      name: "Bookmarks bar",
      children: [
        {
          type: "url",
          url: "https://obsidian.md/",
          name: "Obsidian",
          date_added: "13345670000000000",
        },
        {
          type: "folder",
          name: "Learning",
          children: [
            {
              type: "url",
              url: "https://example.com/article?utm_source=x",
              name: "Article",
              date_added: "13345671000000000",
            },
            {
              type: "url",
              url: "https://example.com/article", // dup after normalize
              name: "Article dup",
            },
          ],
        },
      ],
    },
    other: { type: "folder", name: "Other", children: [] },
  },
};
