# AI Coding Assistant

A web-based AI coding assistant that leverages Ollama models for code generation, modification, and analysis.

## Features

- 🤖 Choose from your installed Ollama models
- 📝 Modern code editor with syntax highlighting
- 📁 File browser for managing your code files
- 💭 Real-time thinking indicators
- 🖥️ Integrated terminal output
- ⚡ WebSocket-based real-time communication

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Make sure Ollama is installed and running on your system.

3. Run the application:
```bash
python app.py
```

4. Open your browser and navigate to `http://localhost:5000`

## Usage

1. Select an Ollama model from the dropdown menu
2. Use the code editor to write or paste your code
3. Press Ctrl+Enter to run the model on your code
4. View the model's output in the terminal section
5. Use the file browser to manage your code files

## Keyboard Shortcuts

- `Ctrl+Enter`: Run the current code through the selected model
- More shortcuts coming soon!

## Directory Structure

```
.
├── app.py              # Main Flask application
├── requirements.txt    # Python dependencies
├── static/
│   └── js/
│       └── main.js    # Frontend JavaScript
└── templates/
    └── index.html     # Main HTML template
```

## Contributing

Feel free to open issues or submit pull requests to improve the application!
