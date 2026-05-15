import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 修复全局变量
old_vars = """    // 【新增】Mixamo 动画绑定系统（只作用在原始 GLB 上）
    let avatar;
    let skinnedMesh;
    let mixer;
    let armAnimationClip;
    const actions = Object.create(null);
    let currentAction = null;
    const fbxLoader = new FBXLoader();
    // 【替换】使用 models/animations 里的 Mixamo Without Skin 动画
    const armFbxPath = "models/animations/arm_stretch.fbx";
    let armSourceClip = null;"""
new_vars = """    // 【新增】Mixamo 动画绑定系统（只作用在原始 GLB 上）
    let avatar;
    let skinnedMesh;
    let mixer;
    const actions = Object.create(null);
    let currentAction = null;
    const fbxLoader = new FBXLoader();
    
    let pendingActionsToRegister = []; // 等待模型加载完成后注册的 clip
    let loadedAnimCount = 0;
    const TOTAL_ANIMS = 5;"""
content = content.replace(old_vars, new_vars)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch part 5 applied successfully.")
