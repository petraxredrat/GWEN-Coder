from flask import Flask, request, jsonify, render_template, send_from_directory, Response
from flask_socketio import SocketIO
import requests
import os
import subprocess
import threading
import json
import time
import logging
from file_manager import FileManager

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Constants
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
OLLAMA_API_URL = "http://localhost:11434/api"
GENERATED_CODE_DIR = os.path.join(WORKSPACE_DIR, 'generated_code')

# Create generated_code directory if it doesn't exist
os.makedirs(GENERATED_CODE_DIR, exist_ok=True)

# Initialize FileManager
file_manager = FileManager(WORKSPACE_DIR, GENERATED_CODE_DIR)

@app.route('/')
def index():
    logger.info('Serving index page')
    return render_template('index.html')

@app.route('/api/health')
def health_check():
    """Health check endpoint to verify server and Ollama status."""
    try:
        # Check if Ollama is accessible
        ollama_response = requests.get(f"{OLLAMA_API_URL}/tags", timeout=5)
        ollama_status = "ok" if ollama_response.ok else "error"
        
        return jsonify({
            "status": "ok",
            "ollama": ollama_status,
            "workspace": os.path.exists(WORKSPACE_DIR),
            "generated_code": os.path.exists(GENERATED_CODE_DIR)
        })
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

@app.route('/api/models')
def list_models():
    """List available models from Ollama."""
    logger.info('Fetching available models')
    try:
        # Try to get models from Ollama with a short timeout
        response = requests.get(f"{OLLAMA_API_URL}/tags", timeout=5)
        if response.ok:
            try:
                data = response.json()
                if not isinstance(data, dict) or 'models' not in data:
                    raise ValueError("Invalid response format from Ollama")
                
                models = []
                for model in data['models']:
                    if isinstance(model, dict) and 'name' in model:
                        models.append(model['name'])
                
                logger.info(f'Found models: {models}')
                if not models:
                    logger.warning('No models found, returning default model')
                    return jsonify(['qwen2.5-coder:32b']), 200
                
                return jsonify(models)
            except (ValueError, KeyError) as e:
                logger.error(f'Error parsing Ollama response: {e}')
                return jsonify(['qwen2.5-coder:32b']), 200
        else:
            logger.warning(f'Failed to fetch models from Ollama: {response.text}')
            return jsonify(['qwen2.5-coder:32b']), 200
    except requests.Timeout:
        logger.error('Ollama request timed out')
        return jsonify(['qwen2.5-coder:32b']), 200
    except Exception as e:
        logger.error(f'Error listing models: {e}')
        return jsonify(['qwen2.5-coder:32b']), 200

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        prompt = data.get('prompt', '')
        model = data.get('model', 'qwen2.5-coder:32b')
        
        # Create response object for streaming
        def generate():
            try:
                # Process the code generation
                code_blocks = process_code_generation(prompt, model)
                
                # For each code block, emit a code generation event
                for filename, code in code_blocks.items():
                    # Save the file
                    save_generated_file(filename, code)
                    
                    # Emit event to show the code in the UI
                    socketio.emit('code_generation', {
                        'filename': filename,
                        'code': code
                    })
                    
                    yield json.dumps({
                        'type': 'progress',
                        'message': f'Generated file: {filename}'
                    }) + '\n'
                
                # Final success message
                yield json.dumps({
                    'type': 'complete',
                    'message': 'Code generation complete'
                }) + '\n'
                
            except Exception as e:
                yield json.dumps({
                    'type': 'error',
                    'message': str(e)
                }) + '\n'
        
        return Response(generate(), mimetype='application/x-ndjson')
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def process_code_generation(prompt, model='qwen2.5-coder:32b'):
    """Process the code generation request and return code blocks."""
    try:
        # Send request to Ollama
        response = requests.post(f"{OLLAMA_API_URL}/generate", json={
            "model": model,
            "prompt": prompt,
            "stream": False
        })
        response.raise_for_status()
        
        # Extract code blocks from response
        response_data = response.json()
        message = response_data.get('response', '')
        code_blocks = extract_code(message)
        
        if not code_blocks:
            # If no code blocks found, create a default one
            code_blocks = {
                'app.py': message if message else 'print("No code generated")'
            }
        
        return code_blocks
        
    except Exception as e:
        logger.error(f"Error generating code: {e}")
        raise

def extract_code(response):
    """Extract code blocks from the response."""
    code_blocks = {}
    
    # Split response into lines
    lines = response.split('\n')
    current_file = None
    current_code = []
    
    for line in lines:
        if line.startswith('```') and len(line) > 3:
            # Start of a code block with filename
            if current_file and current_code:
                code_blocks[current_file] = '\n'.join(current_code)
                current_code = []
            current_file = line[3:].strip()
        elif line.startswith('```') and current_file:
            # End of a code block
            if current_code:
                code_blocks[current_file] = '\n'.join(current_code)
            current_file = None
            current_code = []
        elif current_file and line.strip():
            # Code line within a block
            current_code.append(line)
    
    # Handle any remaining code block
    if current_file and current_code:
        code_blocks[current_file] = '\n'.join(current_code)
    
    return code_blocks

def save_generated_file(filename, content):
    """Save a generated file and verify it was created."""
    try:
        full_path = os.path.join(GENERATED_CODE_DIR, filename)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
            
        if not os.path.exists(full_path):
            raise Exception(f"Failed to create file: {filename}")
            
        return True
    except Exception as e:
        logger.error(f"Error saving file {filename}: {e}")
        raise

@app.route('/api/files')
def list_files():
    logger.info('Listing files')
    try:
        files = []
        for root, _, filenames in os.walk(WORKSPACE_DIR):
            for filename in filenames:
                if filename.endswith(('.py', '.js', '.html', '.css', '.json', '.txt', '.md')):
                    full_path = os.path.join(root, filename)
                    rel_path = os.path.relpath(full_path, WORKSPACE_DIR)
                    files.append({
                        'path': rel_path,
                        'full_path': full_path,
                        'name': filename
                    })
        logger.info(f'Found files: {files}')
        return jsonify(files)
    except Exception as e:
        logger.error(f'Error listing files: {e}')
        return jsonify({"error": str(e)}), 500

@app.route('/api/files/<path:file_path>')
def get_file(file_path):
    logger.info(f'Fetching file: {file_path}')
    try:
        # Normalize the file path and ensure it's within workspace
        file_path = file_path.replace('\\', '/')
        if file_path.startswith('generated/'):
            full_path = os.path.join(GENERATED_CODE_DIR, file_path[9:])
        else:
            full_path = os.path.join(WORKSPACE_DIR, file_path)
        
        # Security check: ensure file is within workspace
        if not os.path.abspath(full_path).startswith(os.path.abspath(WORKSPACE_DIR)):
            logger.error('Access denied')
            return jsonify({"error": "Access denied"}), 403
        
        if not os.path.exists(full_path):
            logger.error('File not found')
            return jsonify({"error": "File not found"}), 404
        
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        logger.info(f'Fetched file: {file_path}')
        return content
        
    except Exception as e:
        logger.error(f'Error reading file: {e}')
        return jsonify({"error": str(e)}), 500

@app.route('/api/save', methods=['POST'])
def save_file():
    logger.info('Saving file')
    try:
        data = request.json
        file_path = data.get('path', '').replace('\\', '/')
        content = data.get('content')
        
        if not file_path or content is None:
            logger.error('Missing file path or content')
            return jsonify({"error": "Missing file path or content"}), 400

        # Use FileManager to create file
        result = file_manager.create_file(file_path, content)
        
        if result['status'] == 'success':
            return jsonify(result)
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f'Save error: {e}')
        return jsonify({"error": str(e)}), 500

@app.route('/api/file-status')
def get_file_status():
    """Get status of all file operations."""
    return jsonify(file_manager.get_operation_status())

@app.route('/api/run', methods=['POST'])
def run_file():
    logger.info('Running file')
    try:
        data = request.json
        file_path = data.get('path')
        
        if not file_path:
            logger.error('Missing file path')
            return jsonify({"error": "Missing file path"}), 400

        if not file_path.endswith('.py'):
            logger.error('Only Python files can be executed')
            return jsonify({"error": "Only Python files can be executed"}), 400

        full_path = os.path.join(WORKSPACE_DIR, file_path)
        
        # Run the Python file and capture output
        result = subprocess.run(
            ['python', full_path],
            capture_output=True,
            text=True,
            timeout=30
        )

        logger.info(f'File executed: {file_path}')
        return jsonify({
            "output": result.stdout,
            "error": result.stderr
        })
    except subprocess.TimeoutExpired:
        logger.error('Execution timed out')
        return jsonify({"error": "Execution timed out"}), 408
    except Exception as e:
        logger.error(f'Run error: {e}')
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    logger.info('Starting Flask application')
    socketio.run(app, debug=True)
