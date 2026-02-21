#!/bin/bash

# Configuration
PROJECT_ROOT=$(dirname "$(dirname "$(readlink -f "$0")")")
LOGS_DIR="$PROJECT_ROOT/local_data/logs"
TODAY=$(date +%Y-%m-%d)

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Viewing Logs ===${NC}"
echo -e "Logs directory: $LOGS_DIR"

if [ ! -d "$LOGS_DIR" ]; then
    echo -e "${RED}Error: Logs directory not found!${NC}"
    exit 1
fi

case "$1" in
    "errors"|"error")
        LOG_FILE="$LOGS_DIR/errors.log"
        echo -e "${YELLOW}Tailing errors.log...${NC}"
        ;;
    "combined"|"all")
        LOG_FILE="$LOGS_DIR/combined.log"
        echo -e "${YELLOW}Tailing combined.log...${NC}"
        ;;
    *)
        LOG_FILE="$LOGS_DIR/$TODAY.log"
        echo -e "${YELLOW}Tailing today's log ($TODAY.log)...${NC}"
        ;;
esac

if [ ! -f "$LOG_FILE" ]; then
    echo -e "${RED}Log file not found: $LOG_FILE${NC}"
    echo "Listing available logs:"
    ls -lh "$LOGS_DIR"
    exit 1
fi

# Tail the log file
tail -f "$LOG_FILE"
