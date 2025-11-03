import os
import sys

# --- Configuração ---
# Diretório inicial (onde o script está)
START_DIR = '.'

# Pastas que devem ser ignoradas
IGNORED_DIRS = {
    'node_modules',
    '.git',
    '.expo',
    '.expo-shared',
    'dist',
    'build',
}
# --- Fim da Configuração ---

def scan_project_files():
    """
    Varre o projeto, encontra arquivos .ts e .tsx, e imprime seu caminho e conteúdo.
    """
    
    # Verifica se estamos no lugar certo
    if not os.path.exists(os.path.join(START_DIR, 'package.json')):
        print(
            "ERRO: Este script deve ser executado no diretório raiz do projeto frontend "
            "(o mesmo diretório que contém 'package.json').",
            file=sys.stderr
        )
        sys.exit(1)

    print(f"--- 🚀 Iniciando varredura do frontend em: {os.path.abspath(START_DIR)} ---\n")

    file_count = 0

    # os.walk é a melhor forma de varrer uma árvore de diretórios
    for dirpath, dirnames, filenames in os.walk(START_DIR, topdown=True):
        
        # Remove diretórios ignorados da busca (impede o os.walk de entrar neles)
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS]

        for filename in filenames:
            # Verifica se o arquivo tem a extensão desejada
            if filename.endswith(('.ts', '.tsx')):
                file_count += 1
                
                try:
                    # Cria o caminho completo
                    full_path = os.path.join(dirpath, filename)
                    
                    # Cria o caminho relativo (ex: "app/index.tsx")
                    # e garante que use barras normais (/)
                    relative_path = os.path.relpath(full_path, START_DIR).replace(os.path.sep, '/')

                    # Lê o conteúdo do arquivo
                    with open(full_path, 'r', encoding='utf-8') as f:
                        content = f.read()

                    # --- Imprime no formato solicitado ---
                    
                    # Separador para legibilidade
                    if file_count > 1:
                        print("=" * 80 + "\n")
                        
                    print(f'"{relative_path}":')
                    print(f'"') # Imprime a aspa inicial
                    print(content) # Imprime o conteúdo do arquivo
                    print(f'"') # Imprime a aspa final

                except Exception as e:
                    print(f"ERRO ao processar o arquivo {full_path}: {e}", file=sys.stderr)

    print("\n" + "=" * 80)
    print(f"--- ✅ Varredura concluída. Total de {file_count} arquivos encontrados. ---")

if __name__ == "__main__":
    scan_project_files()