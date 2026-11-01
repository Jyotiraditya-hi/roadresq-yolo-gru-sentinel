import torch

ck = torch.load("models/gru_tracking_camera.pt", map_location="cpu", weights_only=False)
for k, v in ck.items():
    if k == "state_dict":
        print("state_dict:")
        for name, t in v.items():
            print("   ", name, tuple(t.shape))
    elif hasattr(v, "shape"):
        print(k, "shape", tuple(v.shape))
        print("   first values:", v.flatten()[:20])
    else:
        print(k, "=", v)