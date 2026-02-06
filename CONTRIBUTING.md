# Contributing to Youwee

We welcome contributions! Here's how you can help.

## Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests and linting:
   ```bash
   bun run lint
   bun run build
   cd src-tauri && cargo check
   ```
5. Commit your changes: `git commit -m 'feat: add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

## Development Tips

- Run `bun run tauri dev` for hot-reloading development
- Frontend changes reflect immediately
- Rust changes require recompilation (automatic in dev mode)

## Code Style

- Use TypeScript for frontend code
- Follow existing code patterns and conventions
- Use Biome for linting and formatting
- Keep components small and focused

## Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Write clear commit messages following the convention
- Update documentation if needed
- Test your changes thoroughly before submitting
