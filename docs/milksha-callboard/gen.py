import json, hashlib, copy
P={'store':'From_Store','point':'From_milksha_point','fp':'From_FoodPanda','uber':'From_UberEat','udd':'From_Udd'}
def item(src,st,n): return {"source_type":f"{P[src]}_{st}","number":n}
frames=[]
# state: list of (src,num,state)
def frame(note,state,t):
    data={"target":"milkshademo001","data":{"number_content":[item(s,st,n) for s,n,st in state],"newsTicker_content":[],"newsTickerSpeed":0}}
    body=json.dumps(data,ensure_ascii=False,separators=(',',':'))
    frames.append({"_note":note,"_expectRing":None,"request":{"isEncrypt":False,"serviceSpecialData_Json":data,"merchant_id":"milksha","account":"demo001","timeStmp":t,"serviceSpecialData_Json_Md5Hash":hashlib.md5(body.encode()).hexdigest(),"signature":"DEMO-NO-SIGNATURE"}})
def ring(prev,cur):
    po={(s,n) for s,n,st in prev if st=='OK'}
    return [f"{s}:{n}" for s,n,st in cur if st=='OK' and (s,n) not in po]
S=[]
steps=[]
def push(note,t):
    steps.append((note,copy.deepcopy(S),t))
# 1 empty open
push("開店，畫面清空（空陣列）","2026-09-25-10-00-00:0001")
S=[('store','1001','Preparing'),('store','1002','Preparing'),('point','P021','Preparing')]
push("第一批：現場 2 筆、迷點 1 筆進準備中","2026-09-25-10-00-05:0002")
S=[('store','1001','OK'),('store','1002','Preparing'),('point','P021','Preparing'),('fp','F37','Preparing'),('uber','U512','Preparing')]
push("1001 轉可取餐（要響）；新增 foodpanda、Uber Eats 準備中","2026-09-25-10-00-10:0003")
S=[('store','1001','OK'),('store','1002','OK'),('point','P021','OK'),('fp','F37','Preparing'),('uber','U512','Preparing'),('udd','D08','Preparing'),('store','1003','Preparing')]
push("1002 與 P021 同時轉可取餐（兩個都要響）；新增 UDD、現場 1003","2026-09-25-10-00-15:0004")
S=[('store','1002','OK'),('point','P021','OK'),('fp','F37','OK'),('uber','U512','Preparing'),('udd','D08','Preparing'),('store','1003','Preparing')]
push("1001 取餐完消失（不響）；F37 轉可取餐（要響）","2026-09-25-10-00-20:0005")
S=[('store','1002','OK'),('point','P021','OK'),('fp','F37','OK'),('uber','U512','OK'),('udd','D08','OK'),('store','1003','Preparing'),('store','1004','OK')]
push("U512、D08 轉可取餐（要響）；1004 直接出現在可取餐（沒經過準備中，也要響）；五種來源都出現過可取餐","2026-09-25-10-00-25:0006")
# rush
prep=[('store',str(n),'Preparing') for n in range(1005,1019)]+[('point',f'P0{n}','Preparing') for n in range(22,26)]+[('fp',f'F{n}','Preparing') for n in range(38,42)]+[('uber',f'U{n}','Preparing') for n in range(513,516)]+[('udd',f'D{n:02d}','Preparing') for n in range(9,12)]
ok=[('store','1002','OK'),('point','P021','OK'),('fp','F37','OK'),('uber','U512','OK'),('udd','D08','OK'),('store','1003','OK'),('store','1004','OK')]
S=ok+prep
push(f"尖峰：準備中一次湧入 {len(prep)} 筆（需翻頁）；1003 轉可取餐（要響）","2026-09-25-10-00-30:0007")
newok=[('store',str(n),'OK') for n in range(1005,1013)]+[('point','P022','OK'),('fp','F38','OK'),('uber','U513','OK')]
okset={(s,n) for s,n,_ in newok}
S=ok+newok+[x for x in prep if (x[0],x[1]) not in okset]
push(f"尖峰：{len(newok)} 筆同時轉可取餐（可取餐也需翻頁，全部要響，建議排隊逐一響）","2026-09-25-10-00-35:0008")
S=[x for x in S if not (x[2]=='OK' and x[1] in {'1002','P021','F37','U512','D08','1003','1004'})]
push("早先 7 筆可取餐被取走一起消失（不響）","2026-09-25-10-00-40:0009")
S=[('store','1013','Preparing'),('store','1014','Preparing')]
push("收尾：只剩 2 筆準備中，其餘全部消失（不響）","2026-09-25-10-00-45:0010")
prev=[]
for note,st,t in steps:
    frame(note,st,t)
    frames[-1]["_expectRing"]=ring(prev,st)
    prev=st
json.dump(frames,open('milksha-demo-script.json','w'),ensure_ascii=False,indent=2)
for i,f in enumerate(frames,1):
    print(i,len(f['request']['serviceSpecialData_Json']['data']['number_content']),f['_expectRing'],f['_note'])
