from PIL import Image
import numpy as np

def remove_background(image_path, output_path):
    img = Image.open(image_path).convert("RGBA")
    data = np.array(img)
    
    # Amostra a cor do fundo nos cantos
    corner_colors = [
        data[0, 0, :3],
        data[0, -1, :3],
        data[-1, 0, :3],
        data[-1, -1, :3]
    ]
    bg_color = np.mean(corner_colors, axis=0)
    
    # Calcula a distância euclidiana da cor de cada pixel até a cor do fundo
    rgb = data[:, :, :3]
    dist = np.sqrt(np.sum((rgb - bg_color) ** 2, axis=-1))
    
    # Máscara: se estiver muito perto do fundo, torna transparente
    mask = dist < 28
    
    # Suaviza as bordas
    alpha = np.where(dist < 18, 0, np.where(dist < 32, ((dist - 18) / 14.0) * 255, 255)).astype(np.uint8)
    
    data[:, :, 3] = alpha
    
    result = Image.fromarray(data)
    result.save(output_path, "PNG")
    print(f"Salvo {output_path}")

remove_background(r"c:\Users\allys\OneDrive\Área de Trabalho\JBC ELETRO\APPS\Dond\caixa_icon.png", r"c:\Users\allys\OneDrive\Área de Trabalho\JBC ELETRO\APPS\Dond\caixa_icon.png")
remove_background(r"c:\Users\allys\OneDrive\Área de Trabalho\JBC ELETRO\APPS\Dond\avaria_icon.png", r"c:\Users\allys\OneDrive\Área de Trabalho\JBC ELETRO\APPS\Dond\avaria_icon.png")
