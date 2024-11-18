// Wait for GWEN object to be initialized
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing GWEN...');
    try {
        // Socket.IO event handlers
        console.log('Setting up Socket.IO handlers...');
        window.GWEN.socket.on('connect', () => {
            console.log('Connected to server');
        });

        window.GWEN.socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });

        // Initialize Monaco Editor
        console.log('Initializing Monaco Editor...');
        require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
        require(['vs/editor/editor.main'], function() {
            window.editor = monaco.editor.create(document.getElementById('editor'), {
                value: '',
                language: 'python',
                theme: 'vs-dark',
                automaticLayout: true
            });
            
            window.editor.onDidChangeModelContent(() => {
                if (window.GWEN.state.currentFile && window.GWEN.state.openFiles.has(window.GWEN.state.currentFile)) {
                    window.GWEN.state.openFiles.get(window.GWEN.state.currentFile).isModified = true;
                }
            });
            
            console.log('Monaco editor initialized successfully');
            
            // Initialize UI after editor is ready
            console.log('Initializing UI...');
            initializeUI();
            console.log('Loading models...');
            loadModels();
            console.log('Loading files...');
            loadFiles();
            console.log('Initialization complete.');
        });

        // File browser setup
        async function loadFiles() {
            try {
                performance.mark('loadFiles-start');
                
                const response = await fetch('/api/files');
                if (!response.ok) throw new Error('Failed to load files');
                const files = await response.json();
                
                const fileList = document.getElementById('file-list');
                fileList.innerHTML = '';
                
                files.forEach(file => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item p-2 hover:bg-gray-100 cursor-pointer';
                    fileItem.textContent = file.path;
                    fileItem.onclick = () => openFile(file.path);
                    fileList.appendChild(fileItem);
                });
                
                performance.mark('loadFiles-end');
                performance.measure('loadFiles', 'loadFiles-start', 'loadFiles-end');
            } catch (error) {
                console.error('Error loading files:', error);
                showError('Failed to load files');
            }
        }

        // File operations
        async function openFile(path) {
            try {
                performance.mark('openFile-start');
                
                if (!window.GWEN.state.openFiles.has(path)) {
                    const response = await fetch(`/api/files/${encodeURIComponent(path)}`);
                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error || 'Failed to load file');
                    }
                    const content = await response.text();
                    window.GWEN.state.openFiles.set(path, { content, isModified: false });
                }
                
                switchToFile(path);
                
                performance.mark('openFile-end');
                performance.measure('openFile', 'openFile-start', 'openFile-end');
            } catch (error) {
                console.error('Error opening file:', error);
                showError(error.message || 'Failed to open file');
            }
        }

        function switchToFile(path) {
            const fileData = window.GWEN.state.openFiles.get(path);
            if (!fileData) return;
            
            window.GWEN.state.currentFile = path;
            window.editor.setValue(fileData.content);
            
            // Set language based on file extension
            const ext = path.split('.').pop().toLowerCase();
            const langMap = {
                'py': 'python',
                'js': 'javascript',
                'html': 'html',
                'css': 'css',
                'json': 'json',
                'md': 'markdown',
                'txt': 'plaintext'
            };
            monaco.editor.setModelLanguage(window.editor.getModel(), langMap[ext] || 'plaintext');
            
            updateFileTabs();
        }

        function updateFileTabs() {
            const tabsContainer = document.getElementById('editor-tabs');
            tabsContainer.innerHTML = '';
            
            window.GWEN.state.openFiles.forEach((data, path) => {
                const tab = document.createElement('div');
                tab.className = `editor-tab ${window.GWEN.state.currentFile === path ? 'active' : ''}`;
                tab.textContent = path;
                
                const closeBtn = document.createElement('span');
                closeBtn.className = 'tab-close';
                closeBtn.textContent = '×';
                closeBtn.onclick = (e) => {
                    e.stopPropagation();
                    closeFile(path);
                };
                
                tab.appendChild(closeBtn);
                tab.onclick = () => switchToFile(path);
                tabsContainer.appendChild(tab);
            });
        }

        function closeFile(path) {
            window.GWEN.state.openFiles.delete(path);
            if (window.GWEN.state.currentFile === path) {
                window.GWEN.state.currentFile = null;
                const nextFile = window.GWEN.state.openFiles.keys().next().value;
                if (nextFile) {
                    switchToFile(nextFile);
                } else {
                    window.editor.setValue('');
                }
            }
            updateFileTabs();
        }

        // Tab management functions
        function createEditorTab(filename, content) {
            const tabId = `tab-${Date.now()}`;
            const tab = document.createElement('div');
            tab.className = 'editor-tab flex items-center';
            tab.dataset.tabId = tabId;
            
            // Create tab content with buttons
            tab.innerHTML = `
                <span class="tab-name mr-2">${filename}</span>
                <div class="tab-buttons flex space-x-1">
                    <button class="save-btn bg-blue-500 hover:bg-blue-600 px-2 py-1 rounded text-xs">Save</button>
                    <button class="edit-btn bg-yellow-500 hover:bg-yellow-600 px-2 py-1 rounded text-xs">Edit</button>
                    <button class="run-btn bg-green-500 hover:bg-green-600 px-2 py-1 rounded text-xs">Run</button>
                    <button class="close-btn text-gray-400 hover:text-white ml-2">&times;</button>
                </div>
            `;
            
            // Add event listeners
            tab.querySelector('.save-btn').addEventListener('click', () => saveFile(filename));
            tab.querySelector('.edit-btn').addEventListener('click', () => toggleEditMode(tabId));
            tab.querySelector('.run-btn').addEventListener('click', () => runFile(filename));
            tab.querySelector('.close-btn').addEventListener('click', () => closeTab(tabId));
            
            // Add tab to tabs container
            document.getElementById('editor-tabs').appendChild(tab);
            
            // Create editor instance for this tab
            const editor = createEditor(tabId, content);
            GWEN.state.openFiles.set(tabId, { filename, editor });
            
            // Activate the new tab
            activateTab(tabId);
            
            return tabId;
        }

        function activateTab(tabId) {
            // Deactivate all tabs
            document.querySelectorAll('.editor-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.dataset.tabId !== tabId) {
                    const editor = GWEN.state.openFiles.get(tab.dataset.tabId)?.editor;
                    if (editor) editor.getElement().style.display = 'none';
                }
            });
            
            // Activate selected tab
            const tab = document.querySelector(`[data-tab-id="${tabId}"]`);
            if (tab) {
                tab.classList.add('active');
                const editor = GWEN.state.openFiles.get(tabId)?.editor;
                if (editor) editor.getElement().style.display = 'block';
                GWEN.state.currentFile = GWEN.state.openFiles.get(tabId)?.filename;
            }
        }

        function closeTab(tabId) {
            const tab = document.querySelector(`[data-tab-id="${tabId}"]`);
            if (tab) {
                // Remove tab element
                tab.remove();
                
                // Dispose editor instance
                const fileInfo = GWEN.state.openFiles.get(tabId);
                if (fileInfo?.editor) {
                    fileInfo.editor.dispose();
                }
                GWEN.state.openFiles.delete(tabId);
                
                // Activate another tab if available
                const remainingTabs = document.querySelectorAll('.editor-tab');
                if (remainingTabs.length > 0) {
                    activateTab(remainingTabs[remainingTabs.length - 1].dataset.tabId);
                }
            }
        }

        // Show code generation progress in middle column
        function showCodeGeneration(filename, code) {
            const tabId = createEditorTab(filename, code);
            
            // Add visual feedback
            const terminal = document.getElementById('terminal');
            terminal.innerHTML += `<div class="text-green-400">Generated file: ${filename}</div>`;
            
            return tabId;
        }

        // Initialize Socket.IO event listeners
        GWEN.socket.on('code_generation', (data) => {
            const { filename, code } = data;
            showCodeGeneration(filename, code);
        });

        // Initialize UI elements and event listeners
        function initializeUI() {
            try {
                console.log('Initializing UI components...');
                
                // Initialize state if not exists
                window.GWEN = window.GWEN || {};
                window.GWEN.state = window.GWEN.state || {
                    currentFile: null,
                    openFiles: new Map(),
                    modelsLoaded: false,
                    isProcessing: false
                };

                // Setup chat input safely
                const chatInput = document.getElementById('chat-input');
                const sendButton = document.getElementById('send-button');
                
                if (chatInput && sendButton) {
                    chatInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !window.GWEN.state.isProcessing) {
                            e.preventDefault();
                            const prompt = chatInput.value.trim();
                            if (prompt) {
                                sendChatRequest(prompt);
                                chatInput.value = '';
                            }
                        }
                    });

                    sendButton.addEventListener('click', () => {
                        if (!window.GWEN.state.isProcessing) {
                            const prompt = chatInput.value.trim();
                            if (prompt) {
                                sendChatRequest(prompt);
                                chatInput.value = '';
                            }
                        }
                    });
                } else {
                    console.warn('Chat components not found');
                }

                // Initialize editor tabs container safely
                const editorTabs = document.getElementById('editor-tabs');
                if (editorTabs) {
                    editorTabs.innerHTML = '';
                } else {
                    console.warn('Editor tabs container not found');
                }

                // Update status indicators
                function updateStatusIndicators(healthData) {
                    const serverStatus = document.getElementById('server-status');
                    const ollamaStatus = document.getElementById('ollama-status');
                    
                    if (healthData.status === 'ok') {
                        serverStatus.className = 'status-indicator healthy';
                        serverStatus.title = 'Server is healthy';
                    } else {
                        serverStatus.className = 'status-indicator unhealthy';
                        serverStatus.title = 'Server is not responding';
                    }
                    
                    if (healthData.ollama === 'ok') {
                        ollamaStatus.className = 'status-indicator healthy';
                        ollamaStatus.title = 'Ollama is healthy';
                    } else {
                        ollamaStatus.className = 'status-indicator unhealthy';
                        ollamaStatus.title = 'Ollama is not responding';
                    }
                }

                // Health check with automatic retry
                async function checkHealth(retryCount = 3, retryDelay = 2000) {
                    try {
                        const response = await fetch('/api/health');
                        const healthData = await response.json();
                        updateStatusIndicators(healthData);
                        return healthData;
                    } catch (error) {
                        console.error('Health check failed:', error);
                        updateStatusIndicators({ status: 'error', ollama: 'error' });
                        
                        if (retryCount > 0) {
                            console.log(`Retrying health check in ${retryDelay}ms... (${retryCount} attempts remaining)`);
                            setTimeout(() => checkHealth(retryCount - 1, retryDelay), retryDelay);
                        }
                        return { status: 'error', ollama: 'error' };
                    }
                }

                // Start health checks
                checkHealth();
                setInterval(checkHealth, 30000);

                console.log('UI initialization complete');
            } catch (error) {
                console.error('Error initializing UI:', error);
                showError('Failed to initialize UI components');
            }
        }

        // Load available models with better error handling and retries
        async function loadModels(retryCount = 3, retryDelay = 2000) {
            console.log('Loading models...');
            try {
                // First check server health
                const healthCheck = await fetch('/api/health');
                const healthData = await healthCheck.json();
                
                if (healthData.status !== 'ok' || healthData.ollama !== 'ok') {
                    throw new Error('Server or Ollama is not healthy');
                }

                const response = await fetch('/api/models');
                if (!response.ok) {
                    throw new Error(`Failed to load models: ${response.statusText}`);
                }

                const models = await response.json();
                const modelSelect = document.getElementById('model-select');
                modelSelect.innerHTML = '';

                models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model;
                    option.textContent = model;
                    if (model === 'qwen2.5-coder:32b') {
                        option.selected = true;
                    }
                    modelSelect.appendChild(option);
                });

                window.GWEN.state.modelsLoaded = true;
                console.log('Models loaded successfully:', models);
                showSuccess('Models loaded successfully');
            } catch (error) {
                console.error('Error loading models:', error);
                
                if (retryCount > 0) {
                    console.log(`Retrying model load in ${retryDelay}ms... (${retryCount} attempts remaining)`);
                    setTimeout(() => loadModels(retryCount - 1, retryDelay), retryDelay);
                } else {
                    showError('Failed to load models. Please check if Ollama is running.');
                    // Set default model as fallback
                    const modelSelect = document.getElementById('model-select');
                    modelSelect.innerHTML = '<option value="qwen2.5-coder:32b">qwen2.5-coder:32b</option>';
                    window.GWEN.state.modelsLoaded = false;
                }
            }
        }

        // Chat operations
        async function sendChatRequest(prompt) {
            if (window.GWEN.state.isProcessing) {
                console.log('Already processing a request');
                return;
            }

            try {
                window.GWEN.state.isProcessing = true;
                const chatInput = document.getElementById('chat-input');
                const sendButton = document.getElementById('send-button');
                const chatOutput = document.getElementById('chat-output');
                
                // Disable input and button
                chatInput.disabled = true;
                sendButton.disabled = false;
                
                // Add user message
                const userMessage = document.createElement('div');
                userMessage.className = 'message user-message';
                userMessage.textContent = prompt;
                chatOutput.appendChild(userMessage);
                
                // Add AI message container with loading indicator
                const aiMessage = document.createElement('div');
                aiMessage.className = 'message ai-message';
                aiMessage.innerHTML = '<div class="loading">AI is thinking...</div>';
                chatOutput.appendChild(aiMessage);
                
                // Scroll to bottom
                chatOutput.scrollTop = chatOutput.scrollHeight;

                // Get selected model
                const selectedModel = document.getElementById('model-select').value;
                
                // Make POST request for chat
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        prompt: prompt,
                        model: selectedModel
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to send chat request');
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                let messageContent = '';
                
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n').filter(line => line.trim());
                    
                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            
                            if (data.type === 'error') {
                                aiMessage.innerHTML = `<div class="error">${data.message}</div>`;
                                window.GWEN.state.isProcessing = false;
                                chatInput.disabled = false;
                                sendButton.disabled = false;
                                break;
                            } else if (data.type === 'progress') {
                                messageContent += data.message + '\n';
                                aiMessage.innerHTML = `<div class="content">${messageContent}</div>`;
                            } else if (data.type === 'complete') {
                                messageContent += data.message;
                                aiMessage.innerHTML = `<div class="content">${messageContent}</div>`;
                                window.GWEN.state.isProcessing = false;
                                chatInput.disabled = false;
                                sendButton.disabled = false;
                                break;
                            }
                            
                            // Scroll to bottom
                            chatOutput.scrollTop = chatOutput.scrollHeight;
                        } catch (error) {
                            console.error('Error processing message:', error, line);
                            continue; // Skip invalid JSON lines
                        }
                    }
                }
            } catch (error) {
                console.error('Chat error:', error);
                showError(error.message || 'Failed to send message');
                window.GWEN.state.isProcessing = false;
            }
        }

        // File saving and running
        async function saveFile(path, content) {
            try {
                performance.mark('saveFile-start');
                
                const response = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path, content })
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to save file');
                }
                
                if (window.GWEN.state.openFiles.has(path)) {
                    window.GWEN.state.openFiles.get(path).content = content;
                    window.GWEN.state.openFiles.get(path).isModified = false;
                }
                
                showSuccess('File saved successfully');
                
                performance.mark('saveFile-end');
                performance.measure('saveFile', 'saveFile-start', 'saveFile-end');
            } catch (error) {
                console.error('Save error:', error);
                showError(error.message || 'Failed to save file');
                throw error;
            }
        }

        async function runFile(filename) {
            try {
                performance.mark('runFile-start');
                
                if (!filename) {
                    if (!window.GWEN.state.currentFile) {
                        showError('No file is currently open');
                        return;
                    }
                    filename = window.GWEN.state.currentFile;
                }
                
                // First save the current file
                await saveFile(filename, window.editor.getValue());
                
                const response = await fetch('/api/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: filename })
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to run file');
                }
                
                const result = await response.json();
                const terminal = document.getElementById('terminal');
                
                terminal.innerHTML = '';
                if (result.output) {
                    terminal.innerHTML += `<pre class="output">${result.output}</pre>`;
                }
                if (result.error) {
                    terminal.innerHTML += `<pre class="error">${result.error}</pre>`;
                }
                
                performance.mark('runFile-end');
                performance.measure('runFile', 'runFile-start', 'runFile-end');
            } catch (error) {
                console.error('Run error:', error);
                showError(error.message || 'Failed to run file');
            }
        }

        // UI feedback
        function showError(message) {
            const notification = document.getElementById('notification');
            notification.textContent = message;
            notification.className = 'error';
            notification.style.display = 'block';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 5000);
        }

        function showSuccess(message) {
            const notification = document.getElementById('notification');
            notification.textContent = message;
            notification.className = 'success';
            notification.style.display = 'block';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 3000);
        }

        // Initialize everything when DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
            try {
                initializeUI();
                loadModels();
                updateFileTabs();
            } catch (error) {
                console.error('Initialization error:', error);
                showError('Failed to initialize application');
            }
        });

    } catch (error) {
        console.error('Failed to initialize main.js:', error);
    }
});
