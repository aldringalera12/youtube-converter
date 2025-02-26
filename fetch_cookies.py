from browser_cookie3 import chrome

# Get cookies from Chrome for YouTube
cookies = chrome(domain_name="youtube.com")

# Convert cookies to a string format for yt-dlp
cookie_str = "; ".join([f"{c.name}={c.value}" for c in cookies])

# Save cookies to a file
with open("cookies.txt", "w") as f:
    f.write(cookie_str)

print("✅ Cookies saved to cookies.txt")
