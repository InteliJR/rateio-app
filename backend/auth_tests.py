import requests
import json
import logging
import time
import subprocess
import sys

# --- Configuração ---
BASE_URL = "http://localhost:3000"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "Admin@123456"

# Email de teste para usuário comum
TEST_EMAIL = f"teste-py-{int(time.time())}@teste.com"
TEST_PASSWORD = "senha12345"

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})

# Tokens
admin_token = None
admin_refresh_token = None
user_token = None
user_refresh_token = None
user_id = None

def pretty_print(response):
    """Helper para imprimir a resposta de forma legível"""
    try:
        logging.info(f"Status: {response.status_code}")
        data = response.json()
        logging.info(f"Resposta: {json.dumps(data, indent=2, ensure_ascii=False)}")
        return data
    except json.JSONDecodeError:
        logging.info(f"Resposta (não-JSON): {response.text}")
        return None

def create_admin_via_docker():
    """Cria o admin inicial via Docker"""
    logging.info("=== Criando Admin Inicial via Docker ===")
    try:
        cmd = [
            "docker", "exec", "-it", "gw-api",
            "npx", "ts-node", "-r", "tsconfig-paths/register",
            "prisma/seed.ts"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            logging.info("✅ Seed executado com sucesso!")
            logging.info(result.stdout)
        else:
            logging.warning("⚠️  Seed já foi executado ou erro:")
            logging.info(result.stderr)
        
        time.sleep(2)  # Aguardar propagação
        return True
        
    except subprocess.TimeoutExpired:
        logging.error("❌ Timeout ao executar seed")
        return False
    except Exception as e:
        logging.error(f"❌ Erro ao criar admin: {e}")
        return False

def test_admin_login():
    """Testa login como admin"""
    global admin_token, admin_refresh_token
    
    logging.info("\n=== 1. Login como ADMIN ===")
    try:
        payload = {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }
        response = session.post(f"{BASE_URL}/auth/login", data=json.dumps(payload))
        data = pretty_print(response)
        
        if response.status_code == 200 and data:
            admin_token = data.get('accessToken')
            admin_refresh_token = data.get('refreshToken')
            logging.info("✅ Login admin bem-sucedido")
            return True
        else:
            logging.error("❌ Falha no login admin")
            return False
            
    except Exception as e:
        logging.error(f"❌ Erro no login admin: {e}")
        return False

def test_create_user_as_admin():
    """ADMIN cria novo usuário"""
    global user_id
    
    logging.info("\n=== 2. ADMIN Cria Novo Usuário ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "email": TEST_EMAIL,
            "name": "Teste Python",
            "password": TEST_PASSWORD,
            "role": "COMERCIAL"
        }
        response = session.post(
            f"{BASE_URL}/users",
            headers=headers,
            data=json.dumps(payload)
        )
        data = pretty_print(response)
        
        if response.status_code == 201 and data:
            user_id = data.get('id')
            logging.info(f"✅ Usuário criado (ID: {user_id})")
            logging.info(f"⚠️  Usuário está INATIVO: {not data.get('isActive', True)}")
            return True
        else:
            logging.error("❌ Falha ao criar usuário")
            return False
            
    except Exception as e:
        logging.error(f"❌ Erro ao criar usuário: {e}")
        return False

def test_inactive_user_login():
    """Tenta login com usuário inativo (deve falhar)"""
    logging.info("\n=== 3. Tentativa de Login com Usuário INATIVO ===")
    try:
        payload = {
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        }
        response = session.post(f"{BASE_URL}/auth/login", data=json.dumps(payload))
        data = pretty_print(response)
        
        if response.status_code == 401:
            logging.info("✅ Bloqueio correto: usuário inativo não pode logar")
            return True
        else:
            logging.error("❌ FALHA DE SEGURANÇA: usuário inativo conseguiu logar!")
            return False
            
    except Exception as e:
        logging.error(f"❌ Erro: {e}")
        return False

def test_activate_user():
    """ADMIN ativa o usuário"""
    logging.info("\n=== 4. ADMIN Ativa o Usuário ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {"isActive": True}
        response = session.patch(
            f"{BASE_URL}/users/{user_id}",
            headers=headers,
            data=json.dumps(payload)
        )
        data = pretty_print(response)
        
        if response.status_code == 200 and data and data.get('isActive'):
            logging.info("✅ Usuário ativado com sucesso")
            return True
        else:
            logging.error("❌ Falha ao ativar usuário")
            return False
            
    except Exception as e:
        logging.error(f"❌ Erro: {e}")
        return False

def test_active_user_login():
    """Login com usuário ativo"""
    global user_token, user_refresh_token
    
    logging.info("\n=== 5. Login com Usuário ATIVO ===")
    try:
        payload = {
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        }
        response = session.post(f"{BASE_URL}/auth/login", data=json.dumps(payload))
        data = pretty_print(response)
        
        if response.status_code == 200 and data:
            user_token = data.get('accessToken')
            user_refresh_token = data.get('refreshToken')
            logging.info("✅ Login usuário bem-sucedido")
            return True
        else:
            logging.error("❌ Falha no login")
            return False
            
    except Exception as e:
        logging.error(f"❌ Erro: {e}")
        return False

def test_user_access_admin_endpoint():
    """Usuário comum tenta acessar endpoint de admin (deve falhar)"""
    logging.info("\n=== 6. Usuário COMERCIAL Tenta Acessar Endpoint ADMIN ===")
    try:
        headers = {"Authorization": f"Bearer {user_token}"}
        response = session.get(f"{BASE_URL}/users", headers=headers)
        data = pretty_print(response)
        
        if response.status_code == 403:
            logging.info("✅ Bloqueio correto: acesso negado para não-admin")
            return True
        else:
            logging.error("❌ FALHA DE SEGURANÇA: usuário comum acessou rota de admin!")
            return False
            
    except Exception as e:
        logging.error(f"❌ Erro: {e}")
        return False

def test_admin_cannot_deactivate_self():
    """Admin tenta desativar a si mesmo (deve falhar)"""
    logging.info("\n=== 7. ADMIN Tenta Desativar a Si Mesmo ===")
    try:
        # Primeiro, obter o ID do admin
        headers = {"Authorization": f"Bearer {admin_token}"}
        me_response = session.get(f"{BASE_URL}/auth/me", headers=headers)
        me_data = me_response.json()
        admin_id = me_data.get('id')
        
        # Tentar desativar
        payload = {"isActive": False}
        response = session.patch(
            f"{BASE_URL}/users/{admin_id}",
            headers=headers,
            data=json.dumps(payload)
        )
        data = pretty_print(response)
        
        if response.status_code == 400:
            logging.info("✅ Bloqueio correto: admin não pode desativar a si mesmo")
            return True
        else:
            logging.error("❌ FALHA: admin conseguiu desativar a si mesmo!")
            return False
            
    except Exception as e:
        logging.error(f"❌ Erro: {e}")
        return False

def test_admin_cannot_change_own_role():
    """Admin tenta mudar própria role (deve falhar)"""
    logging.info("\n=== 8. ADMIN Tenta Mudar Própria Role ===")
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        me_response = session.get(f"{BASE_URL}/auth/me", headers=headers)
        admin_id = me_response.json().get('id')
        
        payload = {"role": "COMERCIAL"}
        response = session.patch(
            f"{BASE_URL}/users/{admin_id}",
            headers=headers,
            data=json.dumps(payload)
        )
        data = pretty_print(response)
        
        if response.status_code == 400:
            logging.info("✅ Bloqueio correto: admin não pode mudar própria role")
            return True
        else:
            logging.error("❌ FALHA: admin conseguiu mudar própria role!")
            return False
            
    except Exception as e:
        logging.error(f"❌ Erro: {e}")
        return False

def test_admin_reset_user_password():
    """Admin reseta senha de outro usuário"""
    logging.info("\n=== 9. ADMIN Reseta Senha de Usuário ===")
    
    # ✅ CRÍTICO: Aguardar rate limit resetar (TTL é 60 segundos)
    logging.info("⏳ Aguardando 65 segundos para reset do rate limit...")
    for i in range(13):
        remaining = 65 - (i * 5)
        logging.info(f"   Aguardando... {remaining}s restantes")
        time.sleep(5)
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {"password": "NovaSenha@123"}
        response = session.patch(
            f"{BASE_URL}/users/{user_id}",
            headers=headers,
            data=json.dumps(payload)
        )
        data = pretty_print(response)
        
        if response.status_code == 200:
            logging.info("✅ Senha resetada com sucesso")
            
            # Aguardar propagação do hash
            logging.info("⏳ Aguardando 2 segundos para propagação...")
            time.sleep(2)
            
            # Usar nova sessão para login
            new_session = requests.Session()
            new_session.headers.update({"Content-Type": "application/json"})
            
            # Testar login com nova senha
            login_payload = {
                "email": TEST_EMAIL,
                "password": "NovaSenha@123"
            }
            
            logging.info("🔄 Tentando login com nova senha...")
            login_response = new_session.post(
                f"{BASE_URL}/auth/login",
                data=json.dumps(login_payload)
            )
            
            login_data = pretty_print(login_response)
            
            if login_response.status_code == 200:
                logging.info("✅ Login com nova senha bem-sucedido")
                return True
            elif login_response.status_code == 429:
                logging.error("❌ Rate limit ainda ativo (isso não deveria acontecer)")
                return False
            else:
                logging.error("❌ Falha no login com nova senha")
                logging.error(f"Detalhes: {login_data}")
                return False
        else:
            logging.error("❌ Falha ao resetar senha")
            return False
            
    except Exception as e:
        logging.error(f"❌ Erro: {e}")
        return False

def test_rate_limiting():
    """Testa rate limiting"""
    logging.info("\n=== 10. Teste de Rate Limiting ===")
    try:
        # Usar nova sessão
        rate_session = requests.Session()
        rate_session.headers.update({"Content-Type": "application/json"})
        
        payload = {
            "email": TEST_EMAIL,
            "password": "senhaerrada123"
        }
        
        for i in range(1, 5):
            logging.info(f"Tentativa {i}/4:")
            response = rate_session.post(f"{BASE_URL}/auth/login", data=json.dumps(payload))
            logging.info(f"Status: {response.status_code}")
            
            if response.status_code == 429:
                logging.info("✅ Rate limit ativado corretamente")
                return True
            
            time.sleep(0.2)
        
        logging.warning("⚠️  Rate limit não foi ativado nas 4 tentativas")
        return False
        
    except Exception as e:
        logging.error(f"❌ Erro: {e}")
        return False

# --- Execução dos Testes ---
def main():
    logging.info("🚀 Iniciando bateria de testes de autenticação e autorização\n")
    
    results = {}
    
    # Criar admin
    results['create_admin'] = create_admin_via_docker()
    if not results['create_admin']:
        logging.error("❌ Não foi possível criar admin. Abortando.")
        sys.exit(1)
    
    # Testes
    results['admin_login'] = test_admin_login()
    if not results['admin_login']:
        logging.error("❌ Login admin falhou. Abortando.")
        sys.exit(1)
    
    results['create_user'] = test_create_user_as_admin()
    results['inactive_login'] = test_inactive_user_login()
    results['activate_user'] = test_activate_user()
    results['active_login'] = test_active_user_login()
    results['user_access_denied'] = test_user_access_admin_endpoint()
    results['admin_self_deactivate'] = test_admin_cannot_deactivate_self()
    results['admin_change_role'] = test_admin_cannot_change_own_role()
    results['admin_reset_password'] = test_admin_reset_user_password()
    results['rate_limiting'] = test_rate_limiting()
    
    # Resumo
    logging.info("\n" + "="*60)
    logging.info("📊 RESUMO DOS TESTES")
    logging.info("="*60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, passed_test in results.items():
        status = "✅ PASSOU" if passed_test else "❌ FALHOU"
        logging.info(f"{test_name:30s} {status}")
    
    logging.info("="*60)
    logging.info(f"Total: {passed}/{total} testes passaram")
    logging.info("="*60)
    
    sys.exit(0 if passed == total else 1)

if __name__ == "__main__":
    main()