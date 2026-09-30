pipeline {
  agent any

  triggers {
    githubPush()
  }

  options {
    timestamps()
    disableConcurrentBuilds(abortPrevious: true)
  }

  environment {
    GIT_BRANCH = 'main'
    DEPLOY_DIR = '/home/lionet/workspace/thuantv/dmd-finance-platform'
    APP_DIR = '/home/lionet/workspace/thuantv/dmd-finance-platform'
    PROJECT_NAME = 'dmd-finance-platform'
    GIT_URL = 'git@github.com:lionet-technology/dmd-order-platform.git'
    DEPLOY_USER = 'lionet'
  }

  stages {
    stage('Sync repo') {
      steps {
        sh '''
          set -eux

          sudo -u "$DEPLOY_USER" env \
            DEPLOY_DIR="$DEPLOY_DIR" \
            GIT_BRANCH="$GIT_BRANCH" \
            GIT_URL="$GIT_URL" \
            bash -lc '
              set -eux

              if [ ! -d "$DEPLOY_DIR/.git" ]; then
                mkdir -p "$(dirname "$DEPLOY_DIR")"
                rm -rf "$DEPLOY_DIR"
                git clone --branch "$GIT_BRANCH" --single-branch "$GIT_URL" "$DEPLOY_DIR"
              fi

              cd "$DEPLOY_DIR"
              git remote set-url origin "$GIT_URL"
              git fetch --prune origin "$GIT_BRANCH"
              git checkout -B "$GIT_BRANCH" "origin/$GIT_BRANCH"
              git reset --hard "origin/$GIT_BRANCH"

              if [ ! -f .env ]; then
                cp .env.example .env
              fi

              mkdir -p data
            '
        '''
      }
    }

    stage('Build & Deploy') {
      steps {
        sh '''
          set -eux

          sudo -u "$DEPLOY_USER" env \
            APP_DIR="$APP_DIR" \
            PROJECT_NAME="$PROJECT_NAME" \
            bash -lc '
              set -eux
              cd "$APP_DIR"

              docker compose version
              DOCKER_BUILDKIT=1 docker compose -p "$PROJECT_NAME" up -d --build --remove-orphans
            '
        '''
      }
    }

    stage('Health check') {
      steps {
        sh '''
          set -eux

          sudo -u "$DEPLOY_USER" env APP_DIR="$APP_DIR" bash -lc '
            set -eux
            cd "$APP_DIR"

            HOST_PORT="$(sed -n "s/^HOST_PORT=//p" .env | tail -1)"
            HOST_PORT="${HOST_PORT:-3419}"

            i=0
            until curl -fsS "http://127.0.0.1:${HOST_PORT}/api/health" >/dev/null; do
              i=$((i + 1))
              if [ "$i" -ge 20 ]; then
                docker compose logs --tail=120 app
                exit 1
              fi
              sleep 3
            done

            docker compose ps
          '
        '''
      }
    }
  }

  post {
    success {
      echo 'Deploy dmd-order-platform success'
    }
    failure {
      echo 'Deploy failed — check Git SSH access, Docker permissions, .env, port conflicts, or app logs.'
    }
  }
}
