# Git-Done

A minimalist, deadline-driven productivity widget for developers. Connect your GitHub activity to accountability timers that only stop when you ship.

## The Concept

Set a coding goal, set a deadline, and watch the countdown tick. The timer only stops when you make the specific commit, close the issue, or merge the PR you committed to. It's "lofi-beats-to-code-to" meets high-stakes accountability.

## Features

- **GitHub Integration**: OAuth login and webhook-based goal verification
- **Minimalist Design**: Dark mode, glassmorphism, clean typography
- **Real-time Countdowns**: Monospaced timers that create focus
- **Embeddable Widgets**: Share your accountability publicly
- **Progressive Web App**: Install on mobile, works offline

## Quick Start

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```
   Update .env with your own values (e.g. DATABASE_URL, SECRET_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET).

3. **Run the application**:
   ```bash
   python application.py
   ```

4. **Open locally in your browser**:
   Navigate to `http://localhost:5000`

5. **Run tests** (optional):
   ```bash
   pytest
   ```

## Testing

The project includes automated tests using pytest to ensure code quality and prevent regressions.

### Running Tests

1. **Install test dependencies** (included in requirements.txt):
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the test suite**:
   ```bash
   pytest
   ```

3. **Run tests with coverage**:
   ```bash
   pytest --cov=application --cov-report=html
   ```

### Test Structure

- `tests/test_api.py`: API endpoint tests (health check, etc.)
- `tests/test_models.py`: Model unit tests (Goal.to_dict(), etc.)
- `tests/conftest.py`: Shared fixtures for Flask app and database setup

Tests use an in-memory SQLite database for isolation and speed.

## Usage

1. **Login with GitHub** - Authenticate via OAuth2
2. **Create a Goal** - Set description, deadline, repo, and completion condition
3. **Start Coding** - The countdown begins immediately
4. **Ship Your Code** - Push commits, close issues, or merge PRs
5. **Goal Complete** - Timer stops, success message appears

## Example Goals

- "Implement user authentication" - Complete when commit contains `#auth-complete`
- "Fix critical bug" - Complete when issue #42 is closed
- "Ship new feature" - Complete when PR to main branch is merged

## Tech Stack

- **Backend**: Python Flask + SQLAlchemy + AWS RDS PostgreSQL
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Integration**: GitHub API + Webhooks
- **Deployment**: AWS Elastic Beanstalk + CloudFront

## Development

The project uses Kiro for development assistance:

- **Specs**: Feature specifications in `.kiro/specs/`
- **Hooks**: Automated workflows in `.kiro/hooks/`
- **Steering**: Project guidelines in `.kiro/steering/`

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details on:

- Development workflow and setup
- Code quality standards
- AWS architecture protection
- Hacktoberfest participation
- MIT License compliance

Whether you're fixing bugs, adding features, or improving documentation, your contributions help make Git-Done better for everyone.

## License

MIT License - Build something awesome.


