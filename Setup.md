# Setup Guide — Jenkins + Gerrit + AI Review

## 1. Subir os serviços

```bash
docker-compose up -d
```

Aguarde ~1 minuto para o Gerrit inicializar completamente.

---

## 2. Configurar o Gerrit

### 2.1 Criar o usuário admin

Acesse http://localhost:8081 e clique em **"Sign In"**.
Na primeira vez, o Gerrit usa autenticação de desenvolvimento (modo DEVELOPMENT_BECOME_ANY_ACCOUNT).
Crie uma conta com o nome `admin` — ela automaticamente vira administradora.

### 2.2 Gerar HTTP Password

1. Clique no avatar > **Settings**
2. Vá em **HTTP Credentials**
3. Clique em **Generate New Password**
4. Copie a senha gerada — você vai precisar dela no `.env`

### 2.3 Adicionar sua chave SSH (para fazer push)

1. Settings > **SSH Keys**
2. Cole o conteúdo do seu `~/.ssh/id_rsa.pub`
3. Se não tiver, gere com: `ssh-keygen -t rsa -b 4096`

### 2.4 Criar um projeto no Gerrit

1. Vá em **Browse > Repositories > Create New**
2. Nome: `meu-projeto`
3. Marque **"Create initial empty commit"**
4. Clique em **Create**

### 2.5 Criar usuário para o Jenkins

1. Faça logout e crie uma nova conta chamada `jenkins-bot`
2. Volte como `admin`
3. Vá em **People > List Groups > "Non-Interactive Users"**
4. Adicione `jenkins-bot` ao grupo
5. Gere um HTTP Password para o `jenkins-bot` e guarde

### 2.6 Atualizar o .env

```env
GEMINI_API_KEY=sua_chave_aqui
GERRIT_URL=http://localhost:8081
GERRIT_USER=jenkins-bot
GERRIT_PASSWORD=senha_gerada_no_passo_2_5
```

---

## 3. Configurar o Jenkins

### 3.1 Acessar o Jenkins

Acesse http://localhost:8080

Pegue a senha inicial:
```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

### 3.2 Instalar plugins

Na tela de plugins, escolha **"Install suggested plugins"** e adicione manualmente:
- **Gerrit Trigger** (busque por "gerrit" na lista)

### 3.3 Configurar o Gerrit Trigger no Jenkins

1. Vá em **Manage Jenkins > System**
2. Role até **Gerrit Trigger**
3. Clique em **Add New Server**
4. Preencha:
   - **Name:** `gerrit-local`
   - **Hostname:** `gerrit` (nome do container na rede Docker)
   - **Frontend URL:** `http://gerrit:8080`
   - **Username:** `jenkins-bot`
   - **HTTP Password:** senha do jenkins-bot
5. Clique em **Test Connection** — deve aparecer "It Works!"
6. Salve

### 3.4 Criar o pipeline

1. **New Item > Pipeline**
2. Nome: `ai-code-review`
3. Em **Build Triggers**, marque **"Gerrit event"**
   - Trigger on: **Patchset Created**
   - Gerrit Project: `meu-projeto`, Branch: `**`
4. Em **Pipeline**, cole o conteúdo do `Jenkinsfile.example`:

```groovy
pipeline {
  agent any

  stages {
    stage('AI Code Review') {
      steps {
        script {
          def diff = sh(
            script: "git diff HEAD~1 HEAD",
            returnStdout: true
          ).trim()

          def payload = groovy.json.JsonOutput.toJson([
            changeId: env.GERRIT_CHANGE_ID,
            revision : env.GERRIT_PATCHSET_REVISION,
            project  : env.GERRIT_PROJECT,
            branch   : env.GERRIT_BRANCH,
            diff     : diff
          ])

          sh """
            curl -s -X POST \\
              -H 'Content-Type: application/json' \\
              -d '${payload}' \\
              http://ai-review:3000/review
          """
        }
      }
    }
  }
}
```

---

## 4. Fazer um push de teste

Clone o repositório via SSH:

```bash
# Instale o commit-msg hook do Gerrit (obrigatório para code review)
git clone ssh://admin@localhost:29418/meu-projeto
cd meu-projeto
scp -p -P 29418 admin@localhost:hooks/commit-msg .git/hooks/

# Faça uma alteração
echo "console.log('test')" > test.js
git add .
git commit -m "test: add test file"

# Push para review (não direto pra main!)
git push origin HEAD:refs/for/main
```

---

## 5. Verificar o resultado

1. Acesse o Gerrit em http://localhost:8081
2. Vá em **Changes > Open**
3. Abra o patchset criado
4. Os comentários da IA devem aparecer nas linhas do diff

---

## Comandos úteis

```bash
# Ver logs de todos os serviços
docker-compose logs -f

# Ver logs só do ai-review
docker-compose logs -f ai-review

# Reiniciar só o ai-review (após mudanças no código)
docker-compose up -d --build ai-review

# Parar tudo
docker-compose down

# Parar e apagar volumes (reset completo)
docker-compose down -v
```