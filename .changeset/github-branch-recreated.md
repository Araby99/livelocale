---
'livelocale': patch
---

Preview editing through GitHub keeps working after the review pull request is merged and GitHub deletes its branch. The server used to remember that the branch existed, so every later save failed and the Studio showed no languages until the server restarted. It now creates the branch again from the base branch and carries on. When several requests, or several servers, find the branch missing at the same time, it is created once and none of them fails.
