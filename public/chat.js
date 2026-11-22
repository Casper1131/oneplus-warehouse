var socket = io.connect('https://connection.onepluscourierja.com',{query: {token:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXNjcmlwdGlvbiI6ImRlc2NyaXB0aW9uIiwiZXh0cmEiOiJub25lIiwiY29tcGFyaXNvbl9pZCI6InRlc3QiLCJpYXQiOjE3MjEyNzUzMjZ9.RobZj6IoO0i_XXEGltpZLOObF73wwVcaYYeh2d1U5e8"}})

socket.on('message',function(d){
    console.log(d)
})