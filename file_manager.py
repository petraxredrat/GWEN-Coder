import os
import logging
from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

@dataclass
class FileOperation:
    operation_type: str  # 'create', 'modify', 'delete'
    file_path: str
    timestamp: datetime
    status: str  # 'pending', 'success', 'failed'
    error_message: Optional[str] = None

class FileManager:
    def __init__(self, workspace_dir: str, generated_code_dir: str):
        self.workspace_dir = workspace_dir
        self.generated_code_dir = generated_code_dir
        self.operations: List[FileOperation] = []
        
    def create_file(self, file_path: str, content: str) -> Dict:
        """Create a new file with tracking and verification."""
        try:
            # Create operation record
            operation = FileOperation(
                operation_type='create',
                file_path=file_path,
                timestamp=datetime.now(),
                status='pending'
            )
            self.operations.append(operation)
            
            # Normalize path and ensure it's within workspace
            full_path = os.path.join(self.generated_code_dir, file_path)
            if not os.path.abspath(full_path).startswith(os.path.abspath(self.workspace_dir)):
                raise ValueError("Access denied: Path outside workspace")
                
            # Create directory if needed
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            
            # Write file
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)
                
            # Verify file was created
            if not os.path.exists(full_path):
                raise FileNotFoundError("File was not created successfully")
                
            # Update operation status
            operation.status = 'success'
            logger.info(f"Successfully created file: {file_path}")
            
            return {
                "status": "success",
                "message": f"File created successfully: {file_path}",
                "path": file_path,
                "timestamp": operation.timestamp.isoformat()
            }
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error creating file {file_path}: {error_msg}")
            if operation:
                operation.status = 'failed'
                operation.error_message = error_msg
            
            return {
                "status": "error",
                "message": f"Failed to create file: {error_msg}",
                "path": file_path
            }
    
    def get_operation_status(self) -> List[Dict]:
        """Get status of all file operations."""
        return [
            {
                "type": op.operation_type,
                "path": op.file_path,
                "status": op.status,
                "timestamp": op.timestamp.isoformat(),
                "error": op.error_message
            }
            for op in self.operations
        ]
