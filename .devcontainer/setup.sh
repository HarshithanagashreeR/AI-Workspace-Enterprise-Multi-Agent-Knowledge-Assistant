#!/bin/bash
echo "Setting up Backend Virtual Environment..."
cd backend
python -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
cd ..

echo "Installing Frontend Node Modules..."
cd frontend
npm install
cd ..

echo "Codespace Setup Completed Successfully!"
echo "To run the app, open two terminals:"
echo "1. Backend: cd backend && source venv/bin/activate && uvicorn app.main:app --reload"
echo "2. Frontend: cd frontend && npm run dev"
