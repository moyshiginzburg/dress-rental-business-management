# Contributing

Thank you for considering contributing to this project! 🎉

---

## Ways to Contribute

- **🐛 Bug Reports** — Open an issue describing what happened and how to reproduce it
- **💡 Feature Requests** — Open an issue with your idea and use case
- **📖 Documentation** — Fix typos, improve clarity, add examples
- **🔧 Code** — Fix a bug or implement a requested feature

---

## Getting Started

1. **Fork** the repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_FORK.git
   cd YOUR_FORK
   ```
3. **Run the configure script** to set up your local environment:
   ```bash
   bash scripts/configure.sh
   ```
4. **Install dependencies** and start the dev server:
   ```bash
   npm install
   npm run dev
   ```
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001

---

## Making Changes

1. Create a **feature branch** from `master`:
   ```bash
   git checkout -b fix/my-bug-fix
   # or
   git checkout -b feat/my-new-feature
   ```

2. Make your changes, keeping them **focused and minimal**

3. Test your changes manually

4. Commit with a clear message:
   ```bash
   git commit -m "fix: correct agreement PDF layout for RTL text"
   # or
   git commit -m "feat: add SMS notification on new order"
   ```

5. Push and open a **Pull Request** against `master`

---

## Commit Message Format

```
type: short description

Optional longer explanation.
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `chore`

---

## Code Style

- **Code and comments**: English
- **UI text**: Hebrew (RTL) — keep existing Hebrew labels unless you're changing the language
- Keep changes small and focused — one thing per PR
- No new dependencies without a good reason

---

## Reporting Security Issues

Please **do not** open a public GitHub issue for security vulnerabilities.  
See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

---

## Questions?

Open an issue and tag it `question`. We're happy to help!
