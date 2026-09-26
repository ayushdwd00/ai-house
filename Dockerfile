# ==============================================================================
# AI House - FastAPI Backend with Headless Blender 4.5 LTS for Photorealistic Rendering
# (Root build context)
# ==============================================================================
FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    TMPDIR=/tmp

WORKDIR /app

# 1. Install system dependencies for headless Blender & Cycles CPU rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    xz-utils \
    ca-certificates \
    libx11-6 \
    libxxf86vm1 \
    libxcursor1 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxinerama1 \
    libxkbcommon0 \
    libgl1 \
    libgl1-mesa-dri \
    libglx-mesa0 \
    libglu1-mesa \
    libsm6 \
    libxext6 \
    libdbus-1-3 \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Blender 4.5.14 LTS (Linux x64)
ENV BLENDER_VERSION=4.5.14
ENV BLENDER_URL=https://download.blender.org/release/Blender4.5/blender-4.5.14-linux-x64.tar.xz

RUN mkdir -p /opt/blender && \
    curl -fsSL ${BLENDER_URL} | tar -xJ --strip-components=1 -C /opt/blender && \
    ln -s /opt/blender/blender /usr/local/bin/blender && \
    ln -s /opt/blender/blender /usr/bin/blender && \
    mkdir -p /tmp/ai_house_renders && \
    chmod 777 /tmp/ai_house_renders

# Ensure Blender is discovered via PATH and BLENDER_PATH
ENV PATH="/opt/blender:${PATH}"
ENV BLENDER_PATH="/usr/local/bin/blender"

# Verify Blender installation during build
RUN /usr/local/bin/blender --version

# 3. Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Copy backend application source
COPY backend/ .

# 5. Production execution
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
