import sys
import os

def get_lang_hint(filename):
    """Retorna a tag de linguagem para o bloco de código Markdown com base na extensão."""
    ext = os.path.splitext(filename)[1]
    hints = {
        '.ts': 'typescript',
        '.js': 'javascript',
        '.py': 'python',
        '.json': 'json',
        '.html': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.md': 'markdown',
        '.sql': 'sql',
    }
    return hints.get(ext, '') # Retorna string vazia se não houver correspondência

def main():
    """
    Script principal para analisar um diretório e gerar um arquivo Markdown
    com o conteúdo de todos os arquivos, exceto os de teste (.spec.ts).
    """
    
    # 1. Validar argumento de entrada
    if len(sys.argv) < 2:
        print("Erro: Forneça o caminho do diretório que deseja analisar.")
        print("Exemplo: python build_docs.py src/auth")
        sys.exit(1)

    target_dir = sys.argv[1] # Ex: 'src/auth'

    # 2. Verificar se o diretório existe
    if not os.path.isdir(target_dir):
        print(f"Erro: O diretório '{target_dir}' não foi encontrado.")
        print("Verifique se o caminho está correto a partir da raiz do projeto.")
        sys.exit(1)

    # 3. Definir nome do arquivo de saída
    # Pega o último nome do caminho (ex: 'auth' de 'src/auth')
    dir_name = os.path.basename(target_dir.rstrip('/\\')) 
    output_filename = f"{dir_name}_review.md"

    try:
        # 4. Abrir arquivo de saída para escrita
        with open(output_filename, 'w', encoding='utf-8') as md_file:
            print(f"Analisando diretório: '{target_dir}'...")
            
            file_count = 0
            # 5. Percorrer todos os arquivos e subdiretórios
            for root, dirs, files in os.walk(target_dir):
                for file in files:
                    
                    # 6. Regra de exclusão
                    if file.endswith('.spec.ts'):
                        print(f"  -> Ignorando: {file}")
                        continue # Pula para o próximo arquivo

                    file_path = os.path.join(root, file)
                    
                    # Normaliza o caminho para usar barras '/' (melhor para markdown)
                    relative_path = os.path.normpath(file_path).replace(os.sep, '/')
                    
                    print(f"  -> Processando: {relative_path}")
                    
                    try:
                        # 7. Ler o conteúdo do arquivo
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()

                        # 8. Escrever no arquivo Markdown
                        # Eu melhorei o formato para ser um Markdown mais limpo:
                        # Usei um Título 3 (###) e um bloco de código com destaque de sintaxe.
                        
                        md_file.write(f"### `{relative_path}`\n\n")
                        md_file.write(f"```{get_lang_hint(file)}\n")
                        md_file.write(content.strip() + "\n") # .strip() remove espaços/linhas extras
                        md_file.write("```\n\n")
                        md_file.write("---\n\n") # Adiciona um separador horizontal
                        
                        file_count += 1

                    except Exception as e:
                        # Lida com erros (ex: arquivos binários, problemas de permissão)
                        print(f"  -> Aviso: Não foi possível ler o arquivo {file_path}. Erro: {e}")
            
            print(f"\nSucesso! {file_count} arquivos processados.")
            print(f"Arquivo de saída gerado: '{output_filename}'")

    except IOError as e:
        print(f"Erro crítico ao escrever o arquivo de saída: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Ocorreu um erro inesperado: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()