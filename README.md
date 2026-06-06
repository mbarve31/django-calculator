# Django Calculator

A clean calculator web app built with Django. The UI handles input and display; calculations are evaluated safely on the server via a JSON API.

## Features

- Modern dark-themed calculator UI
- Keyboard support (digits, operators, Enter, Escape, Backspace)
- Server-side expression evaluation using Python's AST (no `eval()`)
- Supports `+`, `-`, `*`, `/`, `%`, parentheses, and decimals
- Django test suite for core logic and API

## Quick start

```bash
cd django-calculator
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in your browser.

## API

**POST** `/api/calculate/`

Request body:

```json
{ "expression": "2 + 3 * 4" }
```

Response:

```json
{ "expression": "2 + 3 * 4", "result": "14" }
```

## Run tests

```bash
python manage.py test calculator
```

## Project structure

```
django-calculator/
├── calc_project/       # Django project settings
├── calculator/         # Calculator app (views, services, templates, static)
├── manage.py
└── requirements.txt
```
