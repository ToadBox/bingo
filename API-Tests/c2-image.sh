curl -X POST 'http://localhost:3000/api/board/user-202131361748877312/set-cell' \
     -H 'Content-Type: application/json' \
     -d '{
       "row": 1,
       "col": 2,
       "content": "https://image.similarpng.com/very-thumbnail/2020/08/Abstract-blue-wave-on-transparent-background-PNG.png"
     }'