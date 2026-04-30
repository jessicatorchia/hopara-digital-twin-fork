# Hopara

Hopara is an open source digital twin plataform, where you can easily build a digital representation of an operation and show all its data in one place, in real-time. 

Technically speaking, you can think of Hopara as an interesting combination of Grafana, Figma and Prezi. 

The original version of this project was built at MIT by Michael Stonebraker (Postgres), Wenbo Tao and Remco Chang.

https://github.com/user-attachments/assets/d99ddf9d-5a49-49ba-aa21-a8cb59710d2f

## To start using it

With [docker](https://www.docker.com/) installed, just download the docker compose file and run it. Hopara will be available at http://localhost:3000.

```
wget https://github.com/hopara-io/hopara-digital-twin/blob/master/docker-compose.yml \
docker compose up
```

By default, Hopara creates a folder called *storage* in the current path to save its data. You can change it by setting the variable STORAGE_DIR:
```
STORAGE_DIR=/mypath docker compose up
```


## To learn it

* [Docs](https://docs.hopara.app/fundamentals/introduction)
* [Tutorials](https://docs.hopara.app/tutorials/creating-a-room-heatmap)

## SaaS

* [Hopara Cloud](https://hopara.io/)
