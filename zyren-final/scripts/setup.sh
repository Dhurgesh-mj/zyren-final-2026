#!/bin/bash
set -e

echo "============================================"
echo "  InterviewLens - Setup Script"
echo "============================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} $1 found"
    else
        echo -e "  ${RED}✗${NC} $1 not found - please install it"
        exit 1
    fi
}

check_command docker
check_command node
check_command npm
check_command python3

# Setup environment
echo -e "\n${YELLOW}Setting up environment...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "  ${GREEN}✓${NC} Created .env file"
else
    echo -e "  ${YELLOW}→${NC} .env already exists, skipping"
fi

# Install frontend dependencies
echo -e "\n${YELLOW}Installing frontend dependencies...${NC}"
cd frontend
npm install
cd ..
echo -e "  ${GREEN}✓${NC} Frontend dependencies installed"

# Install backend dependencies
echo -e "\n${YELLOW}Installing backend dependencies...${NC}"
cd backend
python3 -m venv venv 2>/dev/null || true
source venv/bin/activate 2>/dev/null || true
pip install -r requirements.txt
cd ..
echo -e "  ${GREEN}✓${NC} Backend dependencies installed"

# Pull Ollama model
echo -e "\n${YELLOW}Pulling Llama 3.2 model...${NC}"
if command -v ollama &> /dev/null; then
    ollama pull llama3.2
    echo -e "  ${GREEN}✓${NC} Llama 3.2 model pulled"
else
    echo -e "  ${YELLOW}→${NC} Ollama not installed locally. Will use Docker container."
fi

# Build Docker images
echo -e "\n${YELLOW}Building Docker images...${NC}"
docker compose build
echo -e "  ${GREEN}✓${NC} Docker images built"

# Build sandbox image
echo -e "\n${YELLOW}Building sandbox image...${NC}"
docker build -t interviewlens-sandbox -f docker/Dockerfile.sandbox ./docker
echo -e "  ${GREEN}✓${NC} Sandbox image built"

echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "To start the application:"
echo "  docker compose up          # Start all services"
echo "  cd frontend && npm run dev # Start frontend dev server"
echo ""
echo "Or run everything:"
echo "  docker compose up -d && cd frontend && npm run dev"
